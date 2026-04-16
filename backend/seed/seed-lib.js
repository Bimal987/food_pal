/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcrypt');

const pool = require('../src/config/db');
const { splitIngredients } = require('../src/utils/normalize');
const { normalizeStoredIngredients } = require('../src/utils/ingredientsCleanup');

const VALID_RECIPE_TYPES = new Set([
  'veg',
  'nonveg',
  'vegan'
]);

function normalizeRecipeType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'non-veg') return 'nonveg';
  return VALID_RECIPE_TYPES.has(raw) ? raw : 'veg';
}

async function ensureSchema() {
  const schemaPath = path.join(__dirname, '..', 'src', 'utils', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      console.log('Schema statement error (may be ok):', err.message);
    }
  }

  // Existing databases may still have the old enum definition for veg_type.
  await pool.query(`
    ALTER TABLE recipes
    MODIFY COLUMN veg_type VARCHAR(32) NOT NULL DEFAULT 'veg'
  `);
  await pool.query(`
    UPDATE recipes
    SET veg_type = 'nonveg'
    WHERE veg_type = 'non-veg'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuisines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    ALTER TABLE recipes
    ADD COLUMN cuisine_id INT NULL
  `).catch(() => {});

  const [cuisineColumnRows] = await pool.query(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'recipes'
      AND COLUMN_NAME = 'cuisine'
  `);

  if ((cuisineColumnRows[0]?.count || 0) > 0) {
    await pool.query(`
      INSERT IGNORE INTO cuisines (name)
      SELECT DISTINCT TRIM(cuisine)
      FROM recipes
      WHERE cuisine IS NOT NULL AND TRIM(cuisine) <> ''
    `);
    await pool.query(`
      UPDATE recipes r
      JOIN cuisines cu ON cu.name = TRIM(r.cuisine)
      SET r.cuisine_id = cu.id
      WHERE r.cuisine_id IS NULL
        AND r.cuisine IS NOT NULL
        AND TRIM(r.cuisine) <> ''
    `);
  }

  await pool.query('ALTER TABLE recipes ADD INDEX idx_recipes_cuisine_id (cuisine_id)').catch(() => {});
  await pool.query('ALTER TABLE recipe_ingredients ADD COLUMN display_text VARCHAR(255) NULL').catch(() => {});
  await pool.query('ALTER TABLE recipe_ingredients ADD COLUMN sort_order INT NOT NULL DEFAULT 0').catch(() => {});
  await pool.query('ALTER TABLE favorites ADD COLUMN tried_at TIMESTAMP NULL').catch(() => {});
  await pool.query(`
    ALTER TABLE recipes
    ADD CONSTRAINT fk_recipes_cuisine FOREIGN KEY (cuisine_id) REFERENCES cuisines(id)
    ON UPDATE CASCADE ON DELETE SET NULL
  `).catch(() => {});
}

async function getOrCreateCategory(name) {
  const [rows] = await pool.query('SELECT id FROM categories WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO categories (name) VALUES (:name)', { name });
  return res.insertId;
}

async function getOrCreateIngredient(name) {
  const [rows] = await pool.query('SELECT id FROM ingredients WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO ingredients (name) VALUES (:name)', { name });
  return res.insertId;
}

async function getOrCreateCuisine(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM cuisines WHERE name = :name', { name });
  if (rows.length) return rows[0].id;
  const [res] = await pool.query('INSERT INTO cuisines (name) VALUES (:name)', { name });
  return res.insertId;
}

async function getOrCreateRecipe(data, categoryId, cuisineId) {
  const [rows] = await pool.query(
    'SELECT id FROM recipes WHERE title = :title AND cuisine_id <=> :cuisineId',
    { title: data.title, cuisineId: cuisineId || null }
  );
  if (rows.length) return { id: rows[0].id, inserted: false };

  const [res] = await pool.query(`
    INSERT INTO recipes (title, description, steps, cook_time, difficulty, cuisine_id, veg_type, image_url, category_id)
    VALUES (:title, :description, :steps, :cook_time, :difficulty, :cuisine_id, :veg_type, :image_url, :category_id)
  `, {
    title: data.title,
    description: data.description || null,
    steps: data.steps || null,
    cook_time: parseInt(data.cook_time || '0', 10),
    difficulty: data.difficulty || 'Medium',
    cuisine_id: cuisineId || null,
    veg_type: normalizeRecipeType(data.type || data.veg_type),
    image_url: data.image_url || null,
    category_id: categoryId
  });

  return { id: res.insertId, inserted: true };
}

async function mapIngredients(recipeId, ingredients) {
  for (const [index, ing] of ingredients.entries()) {
    const ingId = await getOrCreateIngredient(ing.name);
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

async function ensureAdminUser() {
  const adminEmail = 'admin@local.test';
  const [rows] = await pool.query('SELECT id FROM users WHERE email = :email', { email: adminEmail });
  if (rows.length) return;

  const password_hash = await bcrypt.hash('admin123', 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :password_hash, \'admin\')',
    { name: 'Admin', email: adminEmail, password_hash }
  );
  console.log('Seeded admin user: admin@local.test / admin123');
}

async function resetDatabase() {
  console.log('Resetting database tables...');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await pool.query('TRUNCATE TABLE recipe_ingredients');
    await pool.query('TRUNCATE TABLE favorites');
    await pool.query('TRUNCATE TABLE ratings');
    await pool.query('TRUNCATE TABLE recipes');
    await pool.query('TRUNCATE TABLE ingredients');
    await pool.query('TRUNCATE TABLE cuisines');
    await pool.query('TRUNCATE TABLE categories');
    await pool.query('TRUNCATE TABLE users');
  } finally {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function seedDatabase({ reset = false, log = true } = {}) {
  if (log) console.log('--- Seeding started ---');

  await ensureSchema();

  if (reset) {
    await resetDatabase();
  }

  await ensureAdminUser();

  const csvPath = path.join(__dirname, 'recipes.csv');
  if (!fs.existsSync(csvPath)) throw new Error('recipes.csv not found');

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv({
        mapHeaders: ({ header }) => {
          const cleaned = (header || '').replace(/^\uFEFF/, '').trim();
          return cleaned.replace(/^"(.*)"$/, '$1');
        }
      }))
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.title) continue;

    try {
      const categoryName = (row.category || 'General').trim();
      const categoryId = await getOrCreateCategory(categoryName);
      const cuisineId = await getOrCreateCuisine((row.cuisine || '').trim() || null);

      const recipeResult = await getOrCreateRecipe(row, categoryId, cuisineId);
      if (recipeResult.inserted) inserted += 1;
      else skipped += 1;

      const ingredients = splitIngredients(row.ingredients || '');
      await mapIngredients(recipeResult.id, ingredients);
    } catch (err) {
      errors += 1;
      if (log) console.log(`Row error for title="${row.title}":`, err.message);
    }
  }

  const ingredientCleanup = await normalizeStoredIngredients(pool);

  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM recipes');
  const total = countRows[0]?.count ?? 0;

  if (log) {
    console.log(`Seed complete. Imported/checked ${rows.length} rows.`);
    console.log(`Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
    console.log(`Ingredient cleanup: ${ingredientCleanup.updated} updated, ${ingredientCleanup.merged} merged, ${ingredientCleanup.removed} removed`);
    console.log(`Recipes table count: ${total}`);
    console.log('--- Seeding finished ---');
  }

  return { total, inserted, skipped, errors };
}

async function ensureSeededIfEmpty() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM recipes');
  const total = rows[0]?.count ?? 0;
  if (total > 0) {
    const ingredientCleanup = await normalizeStoredIngredients(pool);
    return { total, seeded: false, ingredientCleanup };
  }
  const result = await seedDatabase({ reset: false, log: true });
  return { total: result.total, seeded: true };
}

module.exports = { seedDatabase, ensureSeededIfEmpty };
