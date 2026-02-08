const pool = require('../config/db');
const { getPagination } = require('../utils/pagination');

function buildInClause(name, values) {
  const ids = Array.from(new Set(values.map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0)));
  const placeholders = ids.map((_, i) => `:${name}${i}`);
  const params = {};
  ids.forEach((id, i) => { params[`${name}${i}`] = id; });
  return { ids, placeholders: placeholders.join(', '), params };
}

async function listRecipes(req, res) {
  const { page, limit, offset } = getPagination(req.query);
  const { q, cuisine, difficulty, veg_type, maxTime, category, sort } = req.query;

  const where = [];
  const params = { limit, offset };

  if (q) { where.push('r.title LIKE :q'); params.q = `%${q}%`; }
  if (cuisine) { where.push('r.cuisine = :cuisine'); params.cuisine = cuisine; }
  if (difficulty) { where.push('r.difficulty = :difficulty'); params.difficulty = difficulty; }
  if (veg_type) { where.push('r.veg_type = :veg_type'); params.veg_type = veg_type; }
  if (maxTime) { where.push('r.cook_time <= :maxTime'); params.maxTime = parseInt(maxTime, 10) || 0; }
  if (category) {
    if (/^\d+$/.test(String(category))) {
      where.push('r.category_id = :categoryId');
      params.categoryId = parseInt(category, 10);
    } else {
      where.push('c.name = :categoryName');
      params.categoryName = category;
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) as total
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    ${whereSql}
  `;

  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;

  // Ordering Logic
  let orderBy = 'r.created_at DESC';
  if (sort === 'popular') orderBy = 'avg_rating DESC, ratings_count DESC';
  else if (sort === 'oldest') orderBy = 'r.created_at ASC';
  else if (sort === 'time_asc') orderBy = 'r.cook_time ASC';
  else if (sort === 'time_desc') orderBy = 'r.cook_time DESC';
  else if (sort === 'random') orderBy = 'RAND()';

  const sql = `
    SELECT 
      r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.veg_type, r.image_url,
      c.name AS category_name,
      ROUND(AVG(rt.rating), 1) AS avg_rating,
      COUNT(rt.id) AS ratings_count
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN ratings rt ON rt.recipe_id = r.id
    ${whereSql}
    GROUP BY r.id
    ORDER BY ${orderBy}
    LIMIT :limit OFFSET :offset
  `;

  const [rows] = await pool.query(sql, params);

  return res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
}

async function getRecipeById(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ message: 'Invalid recipe id' });

  const [recipeRows] = await pool.query(`
    SELECT r.*, c.name AS category_name,
           ROUND(AVG(rt.rating), 1) AS avg_rating,
           COUNT(rt.id) AS ratings_count
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN ratings rt ON rt.recipe_id = r.id
    WHERE r.id = :id
    GROUP BY r.id
  `, { id });

  if (!recipeRows.length) return res.status(404).json({ message: 'Recipe not found' });

  const recipe = recipeRows[0];

  const [ingRows] = await pool.query(`
    SELECT i.id, i.name
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = :id
    ORDER BY i.name ASC
  `, { id });

  return res.json({ ...recipe, ingredients: ingRows });
}

async function listRecipesByIngredients(req, res) {
  const rawIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  const mode = (req.query.mode || 'all').toLowerCase() === 'any' ? 'any' : 'all';
  const { page, limit, offset } = getPagination(req.query);

  const { ids, placeholders, params } = buildInClause('ing', rawIds);
  if (!ids.length) return res.status(400).json({ message: 'ids query param is required' });

  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT r.id
      FROM recipes r
      JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      WHERE ri.ingredient_id IN (${placeholders})
      GROUP BY r.id
      HAVING COUNT(DISTINCT ri.ingredient_id) ${mode === 'all' ? '=' : '>='} :needed
    ) t
  `;

  const [countRows] = await pool.query(countSql, {
    ...params,
    needed: mode === 'all' ? ids.length : 1
  });
  const total = countRows[0]?.total || 0;

  const sql = `
    SELECT 
      r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.veg_type, r.image_url,
      c.name AS category_name,
      ROUND(AVG(rt.rating), 1) AS avg_rating,
      COUNT(rt.id) AS ratings_count,
      COUNT(DISTINCT ri.ingredient_id) AS matched_count
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN ratings rt ON rt.recipe_id = r.id
    WHERE ri.ingredient_id IN (${placeholders})
    GROUP BY r.id
    HAVING COUNT(DISTINCT ri.ingredient_id) ${mode === 'all' ? '=' : '>='} :needed
    ORDER BY matched_count DESC, avg_rating DESC
    LIMIT :limit OFFSET :offset
  `;

  const [rows] = await pool.query(sql, {
    ...params,
    needed: mode === 'all' ? ids.length : 1,
    limit,
    offset
  });

  return res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
}

async function getIngredientRecommendations(req, res) {
  const rawIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  const maxMissing = Math.min(Math.max(parseInt(req.query.maxMissing || '2', 10), 1), 5);

  const { ids, placeholders, params } = buildInClause('ing', rawIds);
  if (ids.length < 2) return res.json({ data: [] });

  const [selectedRows] = await pool.query(
    `SELECT id, name FROM ingredients WHERE id IN (${placeholders}) ORDER BY name ASC`,
    params
  );
  const selectedNames = selectedRows.map(r => r.name);

  const sql = `
    SELECT 
      r.id, r.title, r.cook_time, r.difficulty, r.cuisine, r.veg_type, r.image_url,
      c.name AS category_name,
      GROUP_CONCAT(DISTINCT i.name ORDER BY i.name SEPARATOR '||') AS matched_ingredients,
      COUNT(DISTINCT ri.ingredient_id) AS matched_count
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN ingredients i ON i.id = ri.ingredient_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE ri.ingredient_id IN (${placeholders})
    GROUP BY r.id
    HAVING matched_count >= :minMatched AND matched_count < :allMatched
    ORDER BY matched_count DESC
    LIMIT 6
  `;

  const [rows] = await pool.query(sql, {
    ...params,
    minMatched: Math.max(1, ids.length - maxMissing),
    allMatched: ids.length
  });

  const recipeIds = rows.map(r => r.id);
  if (!recipeIds.length) return res.json({ data: [] });

  const { placeholders: recPlaceholders, params: recParams } = buildInClause('rec', recipeIds);
  const [ingRows] = await pool.query(`
    SELECT ri.recipe_id, i.name
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id IN (${recPlaceholders})
    ORDER BY i.name ASC
  `, recParams);

  const byRecipe = new Map();
  for (const row of ingRows) {
    if (!byRecipe.has(row.recipe_id)) byRecipe.set(row.recipe_id, []);
    byRecipe.get(row.recipe_id).push(row.name);
  }

  const data = rows.map(r => {
    const matched = r.matched_ingredients ? r.matched_ingredients.split('||') : [];
    const required = byRecipe.get(r.id) || [];
    const missing = required.filter(name => !selectedNames.includes(name));
    return {
      id: r.id,
      title: r.title,
      cook_time: r.cook_time,
      difficulty: r.difficulty,
      cuisine: r.cuisine,
      veg_type: r.veg_type,
      image_url: r.image_url,
      category_name: r.category_name,
      matched_ingredients: matched,
      required_ingredients: required,
      missing_count: missing.length
    };
  }).filter(r => r.missing_count > 0 && r.missing_count <= maxMissing);

  return res.json({ data });
}

module.exports = { listRecipes, getRecipeById, listRecipesByIngredients, getIngredientRecommendations };
