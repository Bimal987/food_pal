const pool = require('../config/db');

async function getRecommendations(req, res) {
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });
  const userId = req.user && req.user.id ? req.user.id : null;

  // target recipe
  const [targetRows] = await pool.query(
    'SELECT id, cuisine, difficulty, cook_time FROM recipes WHERE id = :id',
    { id: recipeId }
  );
  if (!targetRows.length) return res.status(404).json({ message: 'Recipe not found' });
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

  // group by recipe
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
        cf_score: 0
      });
    }
    if (row.ingredient_name) map.get(row.id).ingredients.add(row.ingredient_name);
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
      // Boost existing candidate
      map.get(row.recipe_id).cf_score = row.overlap * 3; // Weight CF strong
    } else {
      // Optionally fetch full details for CF-only matches?
      // For now, we only boost if it's already in the "candidate set" (share ingredients/cuisine etc)
      // OR we could add it. But 'rows' query gets ALL recipes except current? 
      // PRO TIP: 'rows' query in original code only gets candidates?
      // actually original 'rows' query does "LEFT JOIN ingredients ... WHERE r.id <> :id".
      // It basically selects ALL recipes (since left join and no other filter?).
      // Let's check original query.
      // "FROM recipes r ... WHERE r.id <> :id".
      // YES, it fetches ALL recipes. So map has everything.
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
    
    // Add CF Score
    if (rec.cf_score) score += rec.cf_score;

    // Personalization: exclude or adjust based on user's ratings
    if (userRatingsMap.size) {
      const userRating = userRatingsMap.get(rec.id);
      if (typeof userRating === 'number') {
        if (userRating <= 2) continue; // don't recommend recipes the user disliked
        if (userRating === 3) score -= 1;
        if (userRating >= 4) score += 2;
      }
      if (typeof targetUserRating === 'number' && targetUserRating <= 2) {
        // If user disliked the target recipe, dampen similarity-only signals
        score -= 2;
      }
    }

    if (score > 0) scored.push({ ...rec, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5).map(r => ({
    id: r.id,
    title: r.title,
    cook_time: r.cook_time,
    difficulty: r.difficulty,
    image_url: r.image_url,
    score: r.score
  }));

  return res.json(top);
}

module.exports = { getRecommendations };
