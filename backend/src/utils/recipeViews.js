const pool = require('../config/db');

let ensureViewColumnPromise = null;
const VIEW_COLUMN_CANDIDATES = ['view_count', 'views', 'viewCount'];

function ensureRecipeViewColumn() {
  if (!ensureViewColumnPromise) {
    ensureViewColumnPromise = (async () => {
      const [dbRows] = await pool.query('SELECT DATABASE() AS dbName');
      const dbName = dbRows[0]?.dbName;
      if (!dbName) throw new Error('Database is not selected');

      const [columns] = await pool.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :dbName
           AND TABLE_NAME = 'recipes'
           AND COLUMN_NAME IN ('view_count', 'views', 'viewCount')`,
        { dbName }
      );

      const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
      const existingViewColumn = VIEW_COLUMN_CANDIDATES.find((columnName) => existingColumns.has(columnName));
      if (existingViewColumn) {
        return existingViewColumn;
      }

      await pool.query('ALTER TABLE recipes ADD COLUMN view_count INT NOT NULL DEFAULT 0');
      return 'view_count';
    })().catch((err) => {
      ensureViewColumnPromise = null;
      throw err;
    });
  }

  return ensureViewColumnPromise;
}

module.exports = { ensureRecipeViewColumn };
