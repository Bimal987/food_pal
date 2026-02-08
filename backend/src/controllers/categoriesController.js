const pool = require('../config/db');

async function listCategories(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY name ASC');
  res.json(rows);
}

module.exports = { listCategories };
