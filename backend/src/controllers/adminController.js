const pool = require('../config/db');
const { splitIngredients } = require('../utils/normalize');
const {
  sanitizeText,
  validateLength,
  validateNumber,
  hasSuspiciousInput,
  sendValidationError
} = require('../utils/validator');

const VALID_DIFFICULTIES = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};
const VALID_VEG_TYPES = new Set(['veg', 'non-veg']);

function normalizeDifficulty(value) {
  const key = sanitizeText(value).toLowerCase();
  return VALID_DIFFICULTIES[key] || null;
}

function normalizeIngredients(ingredients) {
  const rawList = Array.isArray(ingredients) ? ingredients : splitIngredients(ingredients || '');
  return rawList
    .map(item => sanitizeText(item).toLowerCase())
    .filter(Boolean);
}

// Validates and sanitizes recipe payload so all admin write paths enforce identical rules.
function validateRecipePayload(body, { partial = false } = {}) {
  const errors = [];

  const rawTitle = body?.title;
  const rawDescription = body?.description;
  const rawSteps = body?.steps;
  const rawCuisine = body?.cuisine;
  const rawImageUrl = body?.image_url;
  const rawCategoryName = body?.category_name;
  const rawDifficulty = body?.difficulty;
  const rawVegType = body?.veg_type;
  const rawCookTime = body?.cook_time;

  const title = rawTitle !== undefined ? sanitizeText(rawTitle) : undefined;
  const description = rawDescription !== undefined ? sanitizeText(rawDescription) : undefined;
  const steps = rawSteps !== undefined ? sanitizeText(rawSteps) : undefined;
  const cuisine = rawCuisine !== undefined ? sanitizeText(rawCuisine) : undefined;
  const image_url = rawImageUrl !== undefined ? sanitizeText(rawImageUrl) : undefined;
  const category_name = rawCategoryName !== undefined ? sanitizeText(rawCategoryName) : undefined;
  const difficulty = rawDifficulty !== undefined ? normalizeDifficulty(rawDifficulty) : undefined;
  const veg_type = rawVegType !== undefined ? sanitizeText(rawVegType).toLowerCase() : undefined;

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

  if (rawVegType !== undefined && !VALID_VEG_TYPES.has(veg_type)) {
    errors.push('Dietary type must be veg or non-veg.');
  }

  if (!partial || rawImageUrl !== undefined) {
    if (!image_url) errors.push('Image URL is required.');
    else {
      try {
        // URL parsing blocks malformed or script-like links from being persisted.
        new URL(image_url);
      } catch {
        errors.push('Image URL must be a valid URL.');
      }
    }
  }

  if (cuisine && hasSuspiciousInput(cuisine)) errors.push('Cuisine contains unsafe input.');
  if (category_name && hasSuspiciousInput(category_name)) errors.push('Category name contains unsafe input.');

  const parsedCategoryId = validateNumber(body?.category_id);
  const category_id = parsedCategoryId === null ? null : parseInt(parsedCategoryId, 10);
  if (body?.category_id !== undefined && (!Number.isInteger(category_id) || category_id <= 0)) {
    errors.push('category_id must be a positive number.');
  }

  const ingredients = body?.ingredients !== undefined ? normalizeIngredients(body.ingredients) : undefined;
  if (!partial || body?.ingredients !== undefined) {
    if (!ingredients || !ingredients.length) errors.push('At least one ingredient is required.');
    if ((ingredients || []).some(hasSuspiciousInput)) errors.push('Ingredients contain unsafe input.');
  }

  return {
    errors,
    values: {
      title,
      description,
      steps,
      cook_time: rawCookTime !== undefined ? parseInt(validateNumber(rawCookTime), 10) : undefined,
      difficulty,
      cuisine: cuisine || null,
      veg_type,
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
  const { errors, values } = validateRecipePayload(req.body, { partial: false });
  if (errors.length) return sendValidationError(res, errors);

  let catId = values.category_id;
  if (!catId && values.category_name) catId = await ensureCategory(values.category_name);

  const [result] = await pool.query(`
    INSERT INTO recipes (title, description, steps, cook_time, difficulty, cuisine, veg_type, image_url, category_id)
    VALUES (:title, :description, :steps, :cook_time, :difficulty, :cuisine, :veg_type, :image_url, :category_id)
  `, {
    title: values.title,
    description: values.description,
    steps: values.steps,
    cook_time: values.cook_time,
    difficulty: values.difficulty || 'Medium',
    cuisine: values.cuisine,
    veg_type: values.veg_type || 'veg',
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
    'title', 'description', 'steps', 'cook_time', 'difficulty', 'cuisine',
    'veg_type', 'image_url', 'category_id', 'category_name', 'ingredients'
  ];
  const hasAnyUpdateField = mutableKeys.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (!hasAnyUpdateField) return sendValidationError(res, ['No fields provided to update.']);

  const { errors, values } = validateRecipePayload(payload, { partial: true });
  if (errors.length) return sendValidationError(res, errors);

  let catId = values.category_id;
  if (!catId && values.category_name) catId = await ensureCategory(values.category_name);

  const [result] = await pool.query(`
    UPDATE recipes
    SET title = COALESCE(:title, title),
        description = COALESCE(:description, description),
        steps = COALESCE(:steps, steps),
        cook_time = COALESCE(:cook_time, cook_time),
        difficulty = COALESCE(:difficulty, difficulty),
        cuisine = COALESCE(:cuisine, cuisine),
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
    cuisine: values.cuisine ?? null,
    veg_type: values.veg_type ?? null,
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
