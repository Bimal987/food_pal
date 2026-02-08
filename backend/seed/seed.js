/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = require('../src/config/db');
const { splitIngredients } = require('../src/utils/normalize');

const shouldReset = process.argv.includes('--reset');

async function ensureSchema() {
  const schemaPath = path.join(__dirname, '..', 'src', 'utils', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // MySQL does not allow multiple statements unless enabled; we'll split safely by semicolon lines.
  // This is simple for our schema file.
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      // Ignore errors for CREATE DATABASE/USE in pooled connections
      // We'll just log.
      console.log('Schema statement error (may be ok):', err.message);
    }
  }
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

async function getOrCreateRecipe(data, categoryId) {
  // de-dupe by title + cuisine (uniq index)
  const [rows] = await pool.query(
    'SELECT id FROM recipes WHERE title = :title AND cuisine <=> :cuisine',
    { title: data.title, cuisine: data.cuisine || null }
  );
  if (rows.length) return { id: rows[0].id, inserted: false };

  const [res] = await pool.query(`
    INSERT INTO recipes (title, description, steps, cook_time, difficulty, cuisine, veg_type, image_url, category_id)
    VALUES (:title, :description, :steps, :cook_time, :difficulty, :cuisine, :veg_type, :image_url, :category_id)
  `, {
    title: data.title,
    description: data.description || null,
    steps: data.steps || null,
    cook_time: parseInt(data.cook_time || '0', 10),
    difficulty: data.difficulty || null,
    cuisine: data.cuisine || null,
    veg_type: (data.veg_type || 'veg').toLowerCase() === 'non-veg' ? 'non-veg' : 'veg',
    image_url: data.image_url || null,
    category_id: categoryId
  });

  return { id: res.insertId, inserted: true };
}

async function mapIngredients(recipeId, ingredients) {
  for (const ing of ingredients) {
    const ingId = await getOrCreateIngredient(ing);
    await pool.query(
      'INSERT IGNORE INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (:recipeId, :ingId)',
      { recipeId, ingId }
    );
  }
}

async function ensureAdminUser() {
  // Create a default admin if missing
  const adminEmail = 'admin@local.test';
  const [rows] = await pool.query('SELECT id FROM users WHERE email = :email', { email: adminEmail });
  if (rows.length) return;

  const password_hash = await bcrypt.hash('admin123', 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :password_hash, \'admin\')',
    { name: 'Admin', email: adminEmail, password_hash }
  );
  console.log('✅ Seeded admin user: admin@local.test / admin123');
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
    await pool.query('TRUNCATE TABLE categories');
    await pool.query('TRUNCATE TABLE users');
  } finally {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function seed() {
  console.log('--- Seeding started ---');

  // Ensure DB exists and schema created (best effort)
  await ensureSchema();

  if (shouldReset) {
    await resetDatabase();
  }

  // Ensure admin
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

      const recipeResult = await getOrCreateRecipe(row, categoryId);
      if (recipeResult.inserted) inserted += 1;
      else skipped += 1;

      const ingredients = splitIngredients(row.ingredients || '');
      await mapIngredients(recipeResult.id, ingredients);
    } catch (err) {
      errors += 1;
      console.log(`Row error for title="${row.title}":`, err.message);
    }
  }

  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM recipes');
  const total = countRows[0]?.count ?? 0;

  console.log(`✅ Seed complete. Imported/checked ${rows.length} rows.`);
  console.log(`Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
  console.log(`Recipes table count: ${total}`);
  console.log('--- Seeding finished ---');
  await pool.end();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  try { await pool.end(); } catch (e) {}
  process.exit(1);
});
