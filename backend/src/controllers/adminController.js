const pool = require('../config/db');
const { splitIngredients } = require('../utils/normalize');

async function ensureCategory(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM categories WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO categories (name) VALUES (:name)', { name });
  return res.insertId;
}

async function ensureIngredient(name) {
  const [rows] = await pool.query('SELECT id FROM ingredients WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO ingredients (name) VALUES (:name)', { name });
  return res.insertId;
}

async function replaceRecipeIngredients(recipeId, ingredientsList) {
  await pool.query('DELETE FROM recipe_ingredients WHERE recipe_id = :recipeId', { recipeId });
  for (const ing of ingredientsList) {
    const ingId = await ensureIngredient(ing);
    await pool.query(
      'INSERT IGNORE INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (:recipeId, :ingId)',
      { recipeId, ingId }
    );
  }
}

async function createRecipe(req, res) {
  const {
    title, description, steps, cook_time, difficulty, cuisine, veg_type, image_url,
    category_id, category_name, ingredients
  } = req.body || {};

  if (!title) return res.status(400).json({ message: 'title is required' });

  let catId = category_id ? parseInt(category_id, 10) : null;
  if (!catId && category_name) catId = await ensureCategory(category_name);

  const [result] = await pool.query(`
    INSERT INTO recipes (title, description, steps, cook_time, difficulty, cuisine, veg_type, image_url, category_id)
    VALUES (:title, :description, :steps, :cook_time, :difficulty, :cuisine, :veg_type, :image_url, :category_id)
  `, {
    title,
    description: description || null,
    steps: steps || null,
    cook_time: parseInt(cook_time || '0', 10),
    difficulty: difficulty || null,
    cuisine: cuisine || null,
    veg_type: veg_type || 'veg',
    image_url: image_url || null,
    category_id: catId
  });

  const recipeId = result.insertId;
  const ingList = Array.isArray(ingredients) ? ingredients : splitIngredients(ingredients || '');
  await replaceRecipeIngredients(recipeId, ingList);

  return res.status(201).json({ message: 'Recipe created', id: recipeId });
}

async function updateRecipe(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid recipe id' });

  const {
    title, description, steps, cook_time, difficulty, cuisine, veg_type, image_url,
    category_id, category_name, ingredients
  } = req.body || {};

  let catId = category_id ? parseInt(category_id, 10) : null;
  if (!catId && category_name) catId = await ensureCategory(category_name);

  const [result] = await pool.query(`
    UPDATE recipes
    SET title = COALESCE(:title, title),
        description = :description,
        steps = :steps,
        cook_time = :cook_time,
        difficulty = :difficulty,
        cuisine = :cuisine,
        veg_type = :veg_type,
        image_url = :image_url,
        category_id = :category_id
    WHERE id = :id
  `, {
    id,
    title: title || null,
    description: description ?? null,
    steps: steps ?? null,
    cook_time: parseInt(cook_time || '0', 10),
    difficulty: difficulty || null,
    cuisine: cuisine || null,
    veg_type: veg_type || 'veg',
    image_url: image_url || null,
    category_id: catId
  });

  if (result.affectedRows === 0) return res.status(404).json({ message: 'Recipe not found' });

  const ingList = Array.isArray(ingredients) ? ingredients : splitIngredients(ingredients || '');
  if (ingList.length) {
    await replaceRecipeIngredients(id, ingList);
  }

  return res.json({ message: 'Recipe updated' });
}

async function deleteRecipe(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid recipe id' });

  const [result] = await pool.query('DELETE FROM recipes WHERE id = :id', { id });
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Recipe not found' });

  return res.json({ message: 'Recipe deleted' });
}

async function createCategory(req, res) {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name is required' });
  try {
    await pool.query('INSERT INTO categories (name) VALUES (:name)', { name });
    return res.status(201).json({ message: 'Category created' });
  } catch (err) {
    if (String(err.message || '').includes('Duplicate')) {
      return res.status(409).json({ message: 'Category already exists' });
    }
    throw err;
  }
}

async function updateCategory(req, res) {
  const id = parseInt(req.params.id, 10);
  const { name } = req.body || {};
  if (!id) return res.status(400).json({ message: 'Invalid category id' });
  if (!name) return res.status(400).json({ message: 'name is required' });

  const [result] = await pool.query('UPDATE categories SET name = :name WHERE id = :id', { id, name });
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Category not found' });

  return res.json({ message: 'Category updated' });
}

async function deleteCategory(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid category id' });

  const [result] = await pool.query('DELETE FROM categories WHERE id = :id', { id });
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Category not found' });

  return res.json({ message: 'Category deleted' });
}

async function listAdminRecipes(req, res) {
  const [rows] = await pool.query(`
    SELECT r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.veg_type, r.image_url,
           r.category_id, c.name AS category_name, r.created_at
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    ORDER BY r.created_at DESC
  `);
  res.json(rows);
}

async function getStats(req, res) {
  const [recipes] = await pool.query('SELECT COUNT(*) as count FROM recipes');
  const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
  const [ratings] = await pool.query('SELECT COUNT(*) as count FROM ratings');
  const [categories] = await pool.query('SELECT COUNT(*) as count FROM categories');

  return res.json({
    recipes: recipes[0].count,
    users: users[0].count,
    ratings: ratings[0].count,
    categories: categories[0].count
  });
}

module.exports = {
  createRecipe, updateRecipe, deleteRecipe,
  createCategory, updateCategory, deleteCategory,
  listAdminRecipes, getStats
};
