const pool = require('../config/db');

async function listCuisines(req, res) {
  const [rows] = await pool.query('SELECT id, name FROM cuisines ORDER BY name ASC');
  res.json(rows);
}

module.exports = { listCuisines };
