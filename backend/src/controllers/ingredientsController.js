const pool = require('../config/db');

async function listIngredients(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM ingredients ORDER BY name ASC');
  res.json(rows);
}

module.exports = { listIngredients };
