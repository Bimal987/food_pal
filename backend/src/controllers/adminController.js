const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { splitIngredients } = require('../utils/normalize');
const { ensureRecipeViewColumn } = require('../utils/recipeViews');
const {
  sanitizeText,
  validateLength,
  validatePassword,
  validateNumber,
  hasSuspiciousInput,
  sendValidationError
} = require('../utils/validator');

const VALID_DIFFICULTIES = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};
const VALID_RECIPE_TYPES = new Set(['veg', 'nonveg', 'vegan']);

function normalizeDifficulty(value) {
  const key = sanitizeText(value).toLowerCase();
  return VALID_DIFFICULTIES[key] || null;
}

function normalizeRecipeType(value) {
  const key = sanitizeText(value).toLowerCase();
  if (key === 'non-veg') return 'nonveg';
  return VALID_RECIPE_TYPES.has(key) ? key : null;
}

function isValidRecipeImagePath(value) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  return /^\/?images\/[^?#]+\.(jpe?g|png|webp|gif)(\?[^#]*)?(#.*)?$/i.test(value);
}

function normalizeIngredients(ingredients) {
  const rawList = splitIngredients(Array.isArray(ingredients) ? ingredients : (ingredients || ''));
  return rawList
    .map((item) => ({
      display: sanitizeText(item.display),
      name: sanitizeText(item.name).toLowerCase()
    }))
    .filter((item) => item.display && item.name);
}

// Validates and sanitizes recipe payload so all admin write paths enforce identical rules.
function validateRecipePayload(body, { partial = false } = {}) {
  const errors = [];

  const rawTitle = body?.title;
  const rawDescription = body?.description;
  const rawSteps = body?.steps;
  const rawCuisine = body?.cuisine_name ?? body?.cuisine;
  const rawImageUrl = body?.image_url;
  const rawCategoryName = body?.category_name;
  const rawCuisineId = body?.cuisine_id;
  const rawDifficulty = body?.difficulty;
  const rawType = body?.type ?? body?.veg_type;
  const rawCookTime = body?.cook_time;

  const title = rawTitle !== undefined ? sanitizeText(rawTitle) : undefined;
  const description = rawDescription !== undefined ? sanitizeText(rawDescription) : undefined;
  const steps = rawSteps !== undefined ? sanitizeText(rawSteps) : undefined;
  const cuisine = rawCuisine !== undefined ? sanitizeText(rawCuisine) : undefined;
  const image_url = rawImageUrl !== undefined ? sanitizeText(rawImageUrl) : undefined;
  const category_name = rawCategoryName !== undefined ? sanitizeText(rawCategoryName) : undefined;
  const difficulty = rawDifficulty !== undefined ? normalizeDifficulty(rawDifficulty) : undefined;
  const type = rawType !== undefined ? normalizeRecipeType(rawType) : undefined;

  if (!partial || rawTitle !== undefined) {
    if (!title) errors.push('Title is required.');
    else if (!validateLength(title, 3, 100)) errors.push('Title must be between 3 and 100 characters.');
    if (title && hasSuspiciousInput(title)) errors.push('Title contains unsafe input.');
  }

  if (!partial || rawDescription !== undefined) {
    if (!description) errors.push('Description is required.');
    else if (!validateLength(description, 1, 1000)) errors.push('Description must be between 1 and 1000 characters.');
    if (description && hasSuspiciousInput(description)) errors.push('Description contains unsafe input.');
  }

  if (!partial || rawSteps !== undefined) {
    if (!steps) errors.push('Steps are required.');
    else if (!validateLength(steps, 1, 4000)) errors.push('Steps must be at most 4000 characters.');
    if (steps && hasSuspiciousInput(steps)) errors.push('Steps contain unsafe input.');
  }

  if (!partial || rawCookTime !== undefined) {
    const parsedCookTime = validateNumber(rawCookTime);
    if (!Number.isInteger(parsedCookTime) || parsedCookTime <= 0) {
      errors.push('Cook time must be a positive number.');
    }
  }

  if (rawDifficulty !== undefined && !difficulty) {
    errors.push('Difficulty must be easy, medium, or hard.');
  }

  if (rawType !== undefined && !type) {
    errors.push('Type must be one of: veg, nonveg, vegan.');
  }

  if (!partial || rawImageUrl !== undefined) {
    if (!image_url) errors.push('Image URL is required.');
    else if (!isValidRecipeImagePath(image_url)) {
      errors.push('Image must be a valid http(s) URL or a local path like /images/recipe.jpg.');
    }
  }

  if (cuisine && hasSuspiciousInput(cuisine)) errors.push('Cuisine contains unsafe input.');
  if (category_name && hasSuspiciousInput(category_name)) errors.push('Category name contains unsafe input.');

  const parsedCategoryId = validateNumber(body?.category_id);
  const category_id = parsedCategoryId === null ? null : parseInt(parsedCategoryId, 10);
  if (body?.category_id !== undefined && (!Number.isInteger(category_id) || category_id <= 0)) {
    errors.push('category_id must be a positive number.');
  }

  const parsedCuisineId = validateNumber(rawCuisineId);
  const cuisine_id = parsedCuisineId === null ? null : parseInt(parsedCuisineId, 10);
  if (rawCuisineId !== undefined && (!Number.isInteger(cuisine_id) || cuisine_id <= 0)) {
    errors.push('cuisine_id must be a positive number.');
  }

  const ingredients = body?.ingredients !== undefined ? normalizeIngredients(body.ingredients) : undefined;
  if (!partial || body?.ingredients !== undefined) {
    if (!ingredients || !ingredients.length) errors.push('At least one ingredient is required.');
    if ((ingredients || []).some((item) => hasSuspiciousInput(item.display) || hasSuspiciousInput(item.name))) {
      errors.push('Ingredients contain unsafe input.');
    }
  }

  return {
    errors,
    values: {
      title,
      description,
      steps,
      cook_time: rawCookTime !== undefined ? parseInt(validateNumber(rawCookTime), 10) : undefined,
      difficulty,
      cuisine_id,
      cuisine_name: cuisine || null,
      type,
      image_url,
      category_id,
      category_name,
      ingredients
    }
  };
}

async function ensureCategory(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM categories WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO categories (name) VALUES (:name)', { name });
  return res.insertId;
}

async function ensureCuisine(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM cuisines WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO cuisines (name) VALUES (:name)', { name });
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
  for (const [index, ing] of ingredientsList.entries()) {
    const ingId = await ensureIngredient(ing.name);
    await pool.query(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, display_text, sort_order)
       VALUES (:recipeId, :ingId, :displayText, :sortOrder)
       ON DUPLICATE KEY UPDATE
         display_text = VALUES(display_text),
         sort_order = VALUES(sort_order)`,
      {
        recipeId,
        ingId,
        displayText: ing.display,
        sortOrder: index
      }
    );
  }
}

async function createRecipe(req, res) {
  const { errors, values } = validateRecipePayload(req.body, { partial: false });
  if (errors.length) return sendValidationError(res, errors);

  let catId = values.category_id;
  if (!catId && values.category_name) catId = await ensureCategory(values.category_name);
  let cuisineId = values.cuisine_id;
  if (!cuisineId && values.cuisine_name) cuisineId = await ensureCuisine(values.cuisine_name);

  const [result] = await pool.query(`
    INSERT INTO recipes (title, description, steps, cook_time, difficulty, cuisine_id, veg_type, image_url, category_id)
    VALUES (:title, :description, :steps, :cook_time, :difficulty, :cuisine_id, :veg_type, :image_url, :category_id)
  `, {
    title: values.title,
    description: values.description,
    steps: values.steps,
    cook_time: values.cook_time,
    difficulty: values.difficulty || 'Medium',
    cuisine_id: cuisineId,
    veg_type: values.type || 'veg',
    image_url: values.image_url,
    category_id: catId
  });

  const recipeId = result.insertId;
  await replaceRecipeIngredients(recipeId, values.ingredients);

  return res.status(201).json({ message: 'Recipe created', id: recipeId });
}

async function updateRecipe(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid recipe id' });

  const payload = req.body || {};
  const mutableKeys = [
    'title', 'description', 'steps', 'cook_time', 'difficulty', 'cuisine', 'cuisine_id', 'cuisine_name',
    'type', 'veg_type', 'image_url', 'category_id', 'category_name', 'ingredients'
  ];
  const hasAnyUpdateField = mutableKeys.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (!hasAnyUpdateField) return sendValidationError(res, ['No fields provided to update.']);

  const { errors, values } = validateRecipePayload(payload, { partial: true });
  if (errors.length) return sendValidationError(res, errors);

  let catId = values.category_id;
  if (!catId && values.category_name) catId = await ensureCategory(values.category_name);
  let cuisineId = values.cuisine_id;
  if (!cuisineId && values.cuisine_name) cuisineId = await ensureCuisine(values.cuisine_name);

  const [result] = await pool.query(`
    UPDATE recipes
    SET title = COALESCE(:title, title),
        description = COALESCE(:description, description),
        steps = COALESCE(:steps, steps),
        cook_time = COALESCE(:cook_time, cook_time),
        difficulty = COALESCE(:difficulty, difficulty),
        cuisine_id = COALESCE(:cuisine_id, cuisine_id),
        veg_type = COALESCE(:veg_type, veg_type),
        image_url = COALESCE(:image_url, image_url),
        category_id = COALESCE(:category_id, category_id)
    WHERE id = :id
  `, {
    id,
    title: values.title ?? null,
    description: values.description ?? null,
    steps: values.steps ?? null,
    cook_time: values.cook_time ?? null,
    difficulty: values.difficulty ?? null,
    cuisine_id: cuisineId ?? null,
    veg_type: values.type ?? null,
    image_url: values.image_url ?? null,
    category_id: catId
  });

  if (result.affectedRows === 0) return res.status(404).json({ message: 'Recipe not found' });

  if (values.ingredients && values.ingredients.length) {
    await replaceRecipeIngredients(id, values.ingredients);
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
  const name = sanitizeText(req.body?.name || '');
  const errors = [];
  if (!name) errors.push('name is required.');
  if (name && !validateLength(name, 2, 120)) errors.push('Category name must be between 2 and 120 characters.');
  if (name && hasSuspiciousInput(name)) errors.push('Category name contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

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
  const name = sanitizeText(req.body?.name || '');
  const errors = [];
  if (!id) errors.push('Invalid category id.');
  if (!name) errors.push('name is required.');
  if (name && !validateLength(name, 2, 120)) errors.push('Category name must be between 2 and 120 characters.');
  if (name && hasSuspiciousInput(name)) errors.push('Category name contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

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

async function createCuisine(req, res) {
  const name = sanitizeText(req.body?.name || '');
  const errors = [];
  if (!name) errors.push('name is required.');
  if (name && !validateLength(name, 2, 120)) errors.push('Cuisine name must be between 2 and 120 characters.');
  if (name && hasSuspiciousInput(name)) errors.push('Cuisine name contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

  try {
    await pool.query('INSERT INTO cuisines (name) VALUES (:name)', { name });
    return res.status(201).json({ message: 'Cuisine created' });
  } catch (err) {
    if (String(err.message || '').includes('Duplicate')) {
      return res.status(409).json({ message: 'Cuisine already exists' });
    }
    throw err;
  }
}

async function updateCuisine(req, res) {
  const id = parseInt(req.params.id, 10);
  const name = sanitizeText(req.body?.name || '');
  const errors = [];
  if (!id) errors.push('Invalid cuisine id.');
  if (!name) errors.push('name is required.');
  if (name && !validateLength(name, 2, 120)) errors.push('Cuisine name must be between 2 and 120 characters.');
  if (name && hasSuspiciousInput(name)) errors.push('Cuisine name contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

  const [result] = await pool.query('UPDATE cuisines SET name = :name WHERE id = :id', { id, name });
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Cuisine not found' });

  return res.json({ message: 'Cuisine updated' });
}

async function deleteCuisine(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid cuisine id' });

  const [result] = await pool.query('DELETE FROM cuisines WHERE id = :id', { id });
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Cuisine not found' });

  return res.json({ message: 'Cuisine deleted' });
}

async function getAllUsers(req, res) {
  const [rows] = await pool.query(`
    SELECT id, name, email, role, created_at
    FROM users
    ORDER BY created_at DESC, id DESC
  `);
  res.json(rows);
}

async function updateUserPassword(req, res) {
  const userId = parseInt(req.body?.userId, 10);
  const password = String(req.body?.password || req.body?.newPassword || '');
  const errors = [];

  if (!userId) errors.push('Valid user id is required.');
  if (!password) errors.push('New password is required.');
  if (password && !validatePassword(password)) errors.push('Password must be at least 6 characters long.');
  if (errors.length) return sendValidationError(res, errors);

  const [existing] = await pool.query('SELECT id FROM users WHERE id = :id', { id: userId });
  if (!existing.length) return res.status(404).json({ message: 'User not found' });

  const password_hash = await bcrypt.hash(password, 10);
  await pool.query(
    'UPDATE users SET password_hash = :password_hash WHERE id = :id',
    { password_hash, id: userId }
  );

  return res.json({ message: 'Password updated successfully' });
}

async function deleteUser(req, res) {
  const userId = parseInt(req.body?.userId, 10);
  const currentUserId = parseInt(req.user?.id, 10);

  if (!userId) return sendValidationError(res, ['Valid user id is required.']);
  if (userId === currentUserId) {
    return res.status(403).json({ message: 'You cannot delete your own account.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT id FROM users WHERE id = :id FOR UPDATE', { id: userId });
    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    await connection.query('DELETE FROM favorites WHERE user_id = :userId', { userId });
    await connection.query('DELETE FROM ratings WHERE user_id = :userId', { userId });
    await connection.query('DELETE FROM user_events WHERE user_id = :userId', { userId });

    await connection.query('DELETE FROM users WHERE id = :id', { id: userId });
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return res.json({ message: 'User deleted successfully' });
}

async function listAdminRecipes(req, res) {
  const viewColumn = await ensureRecipeViewColumn();
  const [rows] = await pool.query(`
    SELECT r.id, r.title, r.cook_time, r.difficulty, cu.name AS cuisine, r.cuisine_id,
           r.veg_type AS type, r.veg_type, r.image_url,
           r.category_id, c.name AS category_name, r.${viewColumn} AS view_count, r.created_at
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN cuisines cu ON cu.id = r.cuisine_id
    ORDER BY r.created_at DESC
  `);
  res.json(rows);
}

async function getStats(req, res) {
  const viewColumn = await ensureRecipeViewColumn();

  const [recipes] = await pool.query('SELECT COUNT(*) AS count FROM recipes');
  const [users] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'user'");
  const [ratings] = await pool.query('SELECT COUNT(*) AS count FROM ratings');
  const [categories] = await pool.query('SELECT COUNT(*) AS count FROM categories');
  const [cuisines] = await pool.query('SELECT COUNT(*) AS count FROM cuisines');
  const [recentRecipes] = await pool.query(`
    SELECT id, title, created_at
    FROM recipes
    ORDER BY created_at DESC, id DESC
    LIMIT 5
  `);
  const [recentUsers] = await pool.query(`
    SELECT id, name, email, created_at
    FROM users
    WHERE role = 'user'
    ORDER BY created_at DESC, id DESC
    LIMIT 5
  `);
  const [topCategoryRows] = await pool.query(`
    SELECT COALESCE(c.name, 'Uncategorized') AS name, COUNT(r.id) AS recipe_count
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    GROUP BY COALESCE(c.name, 'Uncategorized')
    ORDER BY recipe_count DESC, name ASC
    LIMIT 1
  `);
  const [mostViewedRows] = await pool.query(`
    SELECT id, title, ${viewColumn} AS view_count
    FROM recipes
    ORDER BY ${viewColumn} DESC, title ASC
    LIMIT 1
  `);

  const mostViewed = mostViewedRows[0] && mostViewedRows[0].view_count > 0
    ? {
        id: mostViewedRows[0].id,
        title: mostViewedRows[0].title,
        view_count: mostViewedRows[0].view_count
      }
    : null;
  const topCategory = topCategoryRows[0] && topCategoryRows[0].recipe_count > 0
    ? {
        name: topCategoryRows[0].name,
        recipe_count: topCategoryRows[0].recipe_count
      }
    : null;

  return res.json({
    recipes: recipes[0].count,
    users: users[0].count,
    ratings: ratings[0].count,
    categories: categories[0].count,
    cuisines: cuisines[0].count,
    mostViewedRecipe: mostViewed,
    recentRecipes,
    recentUsers,
    topCategory,
    latestRecipe: recentRecipes[0] || null
  });
}

module.exports = {
  createRecipe, updateRecipe, deleteRecipe,
  createCategory, updateCategory, deleteCategory,
  createCuisine, updateCuisine, deleteCuisine,
  getAllUsers, updateUserPassword, deleteUser,
  listAdminRecipes, getStats
};
