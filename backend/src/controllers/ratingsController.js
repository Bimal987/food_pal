const pool = require('../config/db');
const {
  sanitizeText,
  validateLength,
  validateNumber,
  hasSuspiciousInput,
  sendValidationError
} = require('../utils/validator');

function clampRating(r) {
  const n = validateNumber(r);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
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
  const rating = req.body?.rating;
  const review = sanitizeText(req.body?.review || '');
  const r = clampRating(rating);

  // Rating and review validation protects both data quality and stored-content safety.
  const errors = [];
  if (!recipeId) errors.push('Invalid recipeId.');
  if (!r) errors.push('Rating must be an integer between 1 and 5.');
  if (review && !validateLength(review, 0, 500)) errors.push('Review must be at most 500 characters.');
  if (review && hasSuspiciousInput(review)) errors.push('Review contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

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
  const rating = req.body?.rating;
  const review = sanitizeText(req.body?.review || '');
  const r = clampRating(rating);

  // Update path uses the same constraints so create/update behavior stays consistent.
  const errors = [];
  if (!recipeId) errors.push('Invalid recipeId.');
  if (!r) errors.push('Rating must be an integer between 1 and 5.');
  if (review && !validateLength(review, 0, 500)) errors.push('Review must be at most 500 characters.');
  if (review && hasSuspiciousInput(review)) errors.push('Review contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

  const [result] = await pool.query(
    'UPDATE ratings SET rating = :rating, review = :review WHERE user_id = :userId AND recipe_id = :recipeId',
    { userId, recipeId, rating: r, review: review || null }
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'No existing rating found to update' });
  }

  return res.json({ message: 'Rating updated' });
}

async function deleteRating(req, res) {
  const userId = req.user.id;
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!recipeId) return res.status(400).json({ message: 'Invalid recipeId' });

  const [result] = await pool.query(
    'DELETE FROM ratings WHERE user_id = :userId AND recipe_id = :recipeId',
    { userId, recipeId }
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'No existing rating found to delete' });
  }

  return res.json({ message: 'Rating deleted' });
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

module.exports = { addRating, updateRating, deleteRating, getUserRating, getMyRatings, getRecipeRatings };
