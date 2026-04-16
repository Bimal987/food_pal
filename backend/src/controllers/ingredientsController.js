const pool = require('../config/db');
const { normalizeIngredientName } = require('../utils/normalize');

async function listIngredients(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM ingredients ORDER BY name ASC');
  const seen = new Set();
  const ingredients = rows
    .map((row) => ({
      id: row.id,
      name: normalizeIngredientName(row.name)
    }))
    .filter((row) => row.name)
    .filter((row) => {
      if (seen.has(row.name)) return false;
      seen.add(row.name);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(ingredients);
}

module.exports = { listIngredients };
