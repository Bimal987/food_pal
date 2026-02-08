const pool = require('../config/db');

async function addFavorite(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });

  try {
    await pool.query(
      'INSERT INTO favorites (user_id, recipe_id) VALUES (:userId, :recipeId)',
      { userId, recipeId }
    );
    return res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    if (String(err.message || '').includes('Duplicate')) {
      return res.status(200).json({ message: 'Already in favorites' });
    }
    throw err;
  }
}

async function removeFavorite(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });

  await pool.query('DELETE FROM favorites WHERE user_id = :userId AND recipe_id = :recipeId', { userId, recipeId });
  return res.json({ message: 'Removed from favorites' });
}

async function listFavorites(req, res) {
  const userId = req.user.id;

  const [rows] = await pool.query(`
    SELECT r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.veg_type, r.image_url,
           c.name AS category_name,
           ROUND(AVG(rt.rating), 1) AS avg_rating,
           COUNT(rt.id) AS ratings_count
    FROM favorites f
    JOIN recipes r ON r.id = f.recipe_id
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN ratings rt ON rt.recipe_id = r.id
    WHERE f.user_id = :userId
    GROUP BY r.id
    ORDER BY f.created_at DESC
  `, { userId });

  return res.json(rows);
}

module.exports = { addFavorite, removeFavorite, listFavorites };
