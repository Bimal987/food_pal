const pool = require('../config/db');

// Keep ML influence bounded so heuristic/personal signals still steer ranking.
const ML_WEIGHT = 6;
const DEFAULT_LIMIT = 5;

function isMissingTableError(err) {
  return err && err.code === 'ER_NO_SUCH_TABLE';
}

async function fetchLatestModelVersion() {
  try {
    const [rows] = await pool.query(
      'SELECT model_version FROM model_runs ORDER BY trained_at DESC LIMIT 1'
    );
    return rows.length ? rows[0].model_version : null;
  } catch (err) {
    // Allows zero-downtime rollout before migration/training is complete.
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

async function fetchMlSimilarities(recipeId, modelVersion) {
  if (!modelVersion) return [];

  try {
    const [rows] = await pool.query(`
      SELECT similar_item_id AS recipe_id, score
      FROM model_item_similarities
      WHERE item_id = :recipeId AND model_version = :modelVersion
      ORDER BY score DESC
      LIMIT 200
    `, { recipeId, modelVersion });
    return rows;
  } catch (err) {
    // Recommendation endpoint must remain available even if ML artifacts are absent.
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

function mapRecommendation(rec) {
  return {
    id: rec.id,
    title: rec.title,
    cook_time: rec.cook_time,
    difficulty: rec.difficulty,
    cuisine: rec.cuisine,
    image_url: rec.image_url,
    score: rec.score
  };
}

async function buildRecommendations(recipeId, userId, limit = DEFAULT_LIMIT) {
  const useMlReco = String(process.env.USE_ML_RECO || 'true').toLowerCase() !== 'false';

  // target recipe
  const [targetRows] = await pool.query(
    'SELECT id, cuisine, difficulty, cook_time FROM recipes WHERE id = :id',
    { id: recipeId }
  );
  if (!targetRows.length) return null;
  const target = targetRows[0];

  const [targetIngRows] = await pool.query(`
    SELECT i.name
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = :id
  `, { id: recipeId });
  const targetIngs = new Set(targetIngRows.map(r => r.name));

  let userRatingsMap = new Map();
  let targetUserRating = null;
  if (userId) {
    const [userRatingsRows] = await pool.query(
      'SELECT recipe_id, rating FROM ratings WHERE user_id = :userId',
      { userId }
    );
    userRatingsMap = new Map(userRatingsRows.map(r => [r.recipe_id, r.rating]));
    if (userRatingsMap.has(recipeId)) targetUserRating = userRatingsMap.get(recipeId);
  }

  // fetch candidates with ingredients
  const [rows] = await pool.query(`
    SELECT r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.image_url,
           i.name AS ingredient_name
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    LEFT JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE r.id <> :id
    ORDER BY r.id
  `, { id: recipeId });

  // We build a full candidate map once so all signals can be fused consistently.
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        title: row.title,
        cook_time: row.cook_time,
        difficulty: row.difficulty,
        cuisine: row.cuisine,
        image_url: row.image_url,
        ingredients: new Set(),
        cf_score: 0,
        ml_score: 0
      });
    }
    if (row.ingredient_name) map.get(row.id).ingredients.add(row.ingredient_name);
  }

  if (useMlReco) {
    // Latest version avoids stale pointers and keeps serving behavior deterministic.
    const modelVersion = await fetchLatestModelVersion();
    const mlRows = await fetchMlSimilarities(recipeId, modelVersion);
    for (const row of mlRows) {
      if (map.has(row.recipe_id)) {
        map.get(row.recipe_id).ml_score = Number(row.score) * ML_WEIGHT;
      }
    }
  }

  // Collaborative Signal: "People who liked this also liked..."
  // Find users who rated CURRENT recipe >= 4, and see what else they rated >= 4
  const [cfRows] = await pool.query(`
    SELECT r2.recipe_id, COUNT(*) as overlap
    FROM ratings r1
    JOIN ratings r2 ON r1.user_id = r2.user_id
    WHERE r1.recipe_id = :id AND r1.rating >= 4
      AND r2.recipe_id <> :id AND r2.rating >= 4
    GROUP BY r2.recipe_id
  `, { id: recipeId });

  for (const row of cfRows) {
    if (map.has(row.recipe_id)) {
      // Co-ratings are sparse but high-signal, so they get a stronger multiplier.
      map.get(row.recipe_id).cf_score = row.overlap * 3;
    }
  }

  const scored = [];
  for (const rec of map.values()) {
    let score = 0;
    if (rec.cuisine && target.cuisine && rec.cuisine === target.cuisine) score += 2;
    if (rec.difficulty && target.difficulty && rec.difficulty === target.difficulty) score += 1;
    if (typeof rec.cook_time === 'number' && typeof target.cook_time === 'number') {
      if (Math.abs(rec.cook_time - target.cook_time) <= 10) score += 1;
    }
    for (const ing of rec.ingredients) {
      if (targetIngs.has(ing)) score += 1; // Content overlap
    }
    
    // Add learned + collaborative evidence after content priors.
    if (rec.cf_score) score += rec.cf_score;
    if (rec.ml_score) score += rec.ml_score;

    // Explicit negative feedback should dominate to avoid repeat bad experiences.
    if (userRatingsMap.size) {
      const userRating = userRatingsMap.get(rec.id);
      if (typeof userRating === 'number') {
        if (userRating <= 2) continue;
        if (userRating === 3) score -= 1;
        if (userRating >= 4) score += 2;
      }
      if (typeof targetUserRating === 'number' && targetUserRating <= 2) {
        // If target itself was disliked, reduce confidence in "similar-to-target" signals.
        score -= 2;
      }
    }

    if (score > 0) scored.push({ ...rec, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map(mapRecommendation);

  return top;
}

async function findTopPickSeedRecipeId(userId) {
  const [highRatings] = await pool.query(`
    SELECT recipe_id
    FROM ratings
    WHERE user_id = :userId AND rating >= 4
    ORDER BY rating DESC, created_at DESC
    LIMIT 1
  `, { userId });
  if (highRatings.length) return highRatings[0].recipe_id;

  const [favoriteRows] = await pool.query(`
    SELECT recipe_id
    FROM favorites
    WHERE user_id = :userId
    ORDER BY created_at DESC
    LIMIT 1
  `, { userId });
  if (favoriteRows.length) return favoriteRows[0].recipe_id;

  try {
    const [eventRows] = await pool.query(`
      SELECT recipe_id
      FROM user_events
      WHERE user_id = :userId
      ORDER BY created_at DESC
      LIMIT 1
    `, { userId });
    if (eventRows.length) return eventRows[0].recipe_id;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

  return null;
}

async function getRecommendations(req, res) {
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });
  const userId = req.user && req.user.id ? req.user.id : null;

  const top = await buildRecommendations(recipeId, userId, DEFAULT_LIMIT);
  if (top === null) return res.status(404).json({ message: 'Recipe not found' });

  return res.json(top);
}

async function getTopPick(req, res) {
  const userId = req.user && req.user.id ? req.user.id : null;
  if (!userId) return res.status(401).json({ message: 'Login required' });

  const seedRecipeId = await findTopPickSeedRecipeId(userId);
  if (!seedRecipeId) {
    return res.status(404).json({ message: 'Not enough history for personalized top pick' });
  }

  const picks = await buildRecommendations(seedRecipeId, userId, 1);
  if (!picks || !picks.length) {
    return res.status(404).json({ message: 'No top pick found yet' });
  }

  return res.json({
    ...picks[0],
    seed_recipe_id: seedRecipeId,
    personalized: true
  });
}

module.exports = { getRecommendations, getTopPick };
