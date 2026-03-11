const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../src/config/db');

// We keep soft events weaker than ratings/favorites to reduce noise from casual browsing.
const EVENT_WEIGHTS = {
  view: 0.15,
  click: 0.4,
  favorite: 1.2,
  rate: 0
};

// Maintains a compact per-user sparse vector of item interaction strengths.
// Repeated interactions are accumulated so stronger intent gets stronger weight.
function addInteraction(interactions, userId, recipeId, value) {
  if (!userId || !recipeId || !Number.isFinite(value) || value <= 0) return;
  if (!interactions.has(userId)) interactions.set(userId, new Map());
  const userMap = interactions.get(userId);
  userMap.set(recipeId, (userMap.get(recipeId) || 0) + value);
}

// Computes item-item cosine similarity from user interaction vectors.
// Output is a capped neighbor list per item for fast online retrieval.
function buildSimilarity(interactions, topK, minScore) {
  const itemNorms = new Map();
  const numerators = new Map();

  for (const userItems of interactions.values()) {
    const entries = Array.from(userItems.entries());

    for (const [itemId, weight] of entries) {
      itemNorms.set(itemId, (itemNorms.get(itemId) || 0) + (weight * weight));
    }

    for (let i = 0; i < entries.length; i += 1) {
      const [itemA, weightA] = entries[i];
      if (!numerators.has(itemA)) numerators.set(itemA, new Map());

      for (let j = i + 1; j < entries.length; j += 1) {
        const [itemB, weightB] = entries[j];
        const dot = weightA * weightB;

        const aMap = numerators.get(itemA);
        aMap.set(itemB, (aMap.get(itemB) || 0) + dot);

        if (!numerators.has(itemB)) numerators.set(itemB, new Map());
        const bMap = numerators.get(itemB);
        bMap.set(itemA, (bMap.get(itemA) || 0) + dot);
      }
    }
  }

  const similarities = [];
  for (const [itemId, neighborsMap] of numerators.entries()) {
    const itemNorm = Math.sqrt(itemNorms.get(itemId) || 0);
    if (!itemNorm) continue;

    const neighbors = [];
    for (const [neighborId, numerator] of neighborsMap.entries()) {
      const neighborNorm = Math.sqrt(itemNorms.get(neighborId) || 0);
      if (!neighborNorm) continue;
      // Cosine keeps scores comparable even when popular items have many interactions.
      const score = numerator / (itemNorm * neighborNorm);
      if (score >= minScore) {
        neighbors.push({ similar_item_id: neighborId, score });
      }
    }

    // Top-K controls storage/query cost while preserving strongest neighbors.
    neighbors.sort((a, b) => b.score - a.score);
    const topNeighbors = neighbors.slice(0, topK);
    for (const n of topNeighbors) {
      similarities.push({
        item_id: itemId,
        similar_item_id: n.similar_item_id,
        score: n.score
      });
    }
  }

  return similarities;
}

// Loads training signals from first-party tables and normalizes them into one interaction matrix.
async function readInteractions() {
  const interactions = new Map();

  const [ratingsRows] = await pool.query(
    'SELECT user_id, recipe_id, rating FROM ratings'
  );
  for (const row of ratingsRows) {
    const rating = Number(row.rating);
    const normalized = Math.max(0, Math.min(1, rating / 5));
    addInteraction(interactions, row.user_id, row.recipe_id, normalized * 2.0);
  }

  const [favoriteRows] = await pool.query(
    'SELECT user_id, recipe_id FROM favorites'
  );
  for (const row of favoriteRows) {
    addInteraction(interactions, row.user_id, row.recipe_id, 1.2);
  }

  const [eventRows] = await pool.query(
    'SELECT user_id, recipe_id, event_type, event_value FROM user_events'
  );
  for (const row of eventRows) {
    if (row.event_type === 'rate') {
      const eventRating = Number(row.event_value || 0);
      const normalized = Math.max(0, Math.min(1, eventRating / 5));
      addInteraction(interactions, row.user_id, row.recipe_id, normalized * 2.0);
      continue;
    }

    const weight = EVENT_WEIGHTS[row.event_type] || 0;
    addInteraction(interactions, row.user_id, row.recipe_id, weight);
  }

  let trainRows = 0;
  for (const userMap of interactions.values()) {
    trainRows += userMap.size;
  }

  return { interactions, trainRows };
}

async function writeModel(similarities, trainRows) {
  // Versioned writes let serving atomically pick latest model without destructive updates.
  const modelVersion = `itemcosine_${new Date().toISOString().replace(/[^\dT]/g, '')}`;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const metrics = {
      algorithm: 'item_item_cosine',
      top_k: Number(process.env.MODEL_TOP_K || 100),
      min_score: Number(process.env.MODEL_MIN_SCORE || 0.05),
      similarities_count: similarities.length
    };

    await conn.query(
      'INSERT INTO model_runs (model_version, train_rows, metrics_json) VALUES (:modelVersion, :trainRows, :metricsJson)',
      { modelVersion, trainRows, metricsJson: JSON.stringify(metrics) }
    );

    // Chunking avoids oversized INSERT statements on larger catalogs.
    const chunkSize = 500;
    for (let i = 0; i < similarities.length; i += chunkSize) {
      const chunk = similarities.slice(i, i + chunkSize);
      const placeholders = [];
      const params = { modelVersion };

      chunk.forEach((row, idx) => {
        placeholders.push(`(:itemId${idx}, :similarItemId${idx}, :modelVersion, :score${idx})`);
        params[`itemId${idx}`] = row.item_id;
        params[`similarItemId${idx}`] = row.similar_item_id;
        params[`score${idx}`] = row.score;
      });

      await conn.query(
        `INSERT INTO model_item_similarities (item_id, similar_item_id, model_version, score)
         VALUES ${placeholders.join(', ')}`,
        params
      );
    }

    await conn.commit();
    return { modelVersion, metrics };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Entry point for offline training.
// Typical usage: run on a schedule so new behavior is folded into recommendations regularly.
async function main() {
  try {
    const topK = Number(process.env.MODEL_TOP_K || 100);
    const minScore = Number(process.env.MODEL_MIN_SCORE || 0.05);

    const { interactions, trainRows } = await readInteractions();
    if (!interactions.size) {
      console.log('No interactions found. Nothing to train.');
      return;
    }

    const similarities = buildSimilarity(interactions, topK, minScore);
    if (!similarities.length) {
      console.log('No similarities met threshold. Try lowering MODEL_MIN_SCORE.');
      return;
    }

    const result = await writeModel(similarities, trainRows);
    console.log(`Model trained: ${result.modelVersion}`);
    console.log(`Train rows: ${trainRows}`);
    console.log(`Similarities stored: ${result.metrics.similarities_count}`);
  } catch (err) {
    console.error('Training failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
