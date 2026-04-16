const pool = require('../config/db');
const { validateNumber, sendValidationError } = require('../utils/validator');

function parseRecipeId(value) {
  const n = validateNumber(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function addFavorite(req, res) {
  const userId = req.user.id;
  const recipeId = parseRecipeId(req.params.recipeId);
  if (!recipeId) return sendValidationError(res, ['Invalid recipeId.']);

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
  const recipeId = parseRecipeId(req.params.recipeId);
  if (!recipeId) return sendValidationError(res, ['Invalid recipeId.']);

  await pool.query('DELETE FROM favorites WHERE user_id = :userId AND recipe_id = :recipeId', { userId, recipeId });
  return res.json({ message: 'Removed from favorites' });
}

async function setFavoriteTried(req, res) {
  const userId = req.user.id;
  const recipeId = parseRecipeId(req.params.recipeId);
  if (!recipeId) return sendValidationError(res, ['Invalid recipeId.']);

  const tried = Boolean(req.body?.tried);
  const [result] = await pool.query(
    `UPDATE favorites
     SET tried_at = ${tried ? 'CURRENT_TIMESTAMP' : 'NULL'}
     WHERE user_id = :userId AND recipe_id = :recipeId`,
    { userId, recipeId }
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Favorite not found' });
  }

  return res.json({
    message: tried ? 'Marked as tried' : 'Marked as not tried',
    tried
  });
}

async function listFavorites(req, res) {
  const userId = req.user.id;

  const [rows] = await pool.query(`
    SELECT r.id, r.title, r.cook_time, r.difficulty, cu.name AS cuisine, r.cuisine_id,
           r.veg_type AS type, r.veg_type, r.image_url,
           c.name AS category_name,
           MAX(f.tried_at) AS tried_at,
           CASE WHEN MAX(f.tried_at) IS NULL THEN 0 ELSE 1 END AS tried,
           ROUND(AVG(rt.rating), 1) AS avg_rating,
           COUNT(rt.id) AS ratings_count
    FROM favorites f
    JOIN recipes r ON r.id = f.recipe_id
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN cuisines cu ON cu.id = r.cuisine_id
    LEFT JOIN ratings rt ON rt.recipe_id = r.id
    WHERE f.user_id = :userId
    GROUP BY r.id
    ORDER BY MAX(f.created_at) DESC
  `, { userId });

  return res.json(rows);
}

module.exports = { addFavorite, removeFavorite, setFavoriteTried, listFavorites };
