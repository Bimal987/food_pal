const pool = require('../config/db');

function clampRating(r) {
  const n = parseInt(r, 10);
  if (!n || n < 1 || n > 5) return null;
  return n;
}

async function getUserRating(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });

  const [rows] = await pool.query(
    'SELECT rating, review, created_at FROM ratings WHERE user_id = :userId AND recipe_id = :recipeId',
    { userId, recipeId }
  );
  return res.json(rows[0] || null);
}

async function addRating(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  const { rating, review } = req.body || {};
  const r = clampRating(rating);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });
  if (!r) return res.status(400).json({ message: 'Rating must be 1-5' });

  try {
    await pool.query(
      'INSERT INTO ratings (user_id, recipe_id, rating, review) VALUES (:userId, :recipeId, :rating, :review)',
      { userId, recipeId, rating: r, review: review || null }
    );
    return res.status(201).json({ message: 'Rating added' });
  } catch (err) {
    if (String(err.message || '').includes('Duplicate')) {
      return res.status(409).json({ message: 'You already rated this recipe. Use update.' });
    }
    throw err;
  }
}

async function updateRating(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  const { rating, review } = req.body || {};
  const r = clampRating(rating);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });
  if (!r) return res.status(400).json({ message: 'Rating must be 1-5' });

  const [result] = await pool.query(
    'UPDATE ratings SET rating = :rating, review = :review WHERE user_id = :userId AND recipe_id = :recipeId',
    { userId, recipeId, rating: r, review: review || null }
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'No existing rating found to update' });
  }

  return res.json({ message: 'Rating updated' });
}

async function getMyRatings(req, res) {
  const userId = req.user.id;
  const [rows] = await pool.query(`
    SELECT r.recipe_id, r.rating, r.review, r.created_at,
           rec.title, rec.image_url, rec.difficulty, rec.cook_time
    FROM ratings r
    JOIN recipes rec ON rec.id = r.recipe_id
    WHERE r.user_id = :userId
    ORDER BY r.created_at DESC
  `, { userId });
  return res.json(rows);
}

async function getRecipeRatings(req, res) {
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });

  const [rows] = await pool.query(`
    SELECT r.rating, r.review, r.created_at, u.name AS user_name
    FROM ratings r
    JOIN users u ON u.id = r.user_id
    WHERE r.recipe_id = :recipeId
    ORDER BY r.created_at DESC
  `, { recipeId });

  return res.json(rows);
}

module.exports = { addRating, updateRating, getUserRating, getMyRatings, getRecipeRatings };
