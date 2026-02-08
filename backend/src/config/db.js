const mysql = require('mysql2/promise');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_PORT
} = process.env;

async function initSchema(pool) {
  const schemaPath = path.join(__dirname, '..', 'utils', 'schema.sql');
  let sql;
  try {
    sql = await fs.readFile(schemaPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  const cleaned = sql
    .replace(/CREATE\s+DATABASE[^;]*;/gi, '')
    .replace(/USE\s+[^;]*;/gi, '');

  const statements = cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s);

  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

const poolReady = (async () => {
  if (!DB_NAME) throw new Error('DB_NAME is not set');

  const admin = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT ? Number(DB_PORT) : undefined
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await admin.end();

  const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT ? Number(DB_PORT) : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    multipleStatements: true,
    charset: 'utf8mb4'
  });
  await initSchema(pool);
  return pool;
})();

const pool = {
  query: (...args) => poolReady.then(p => p.query(...args)),
  execute: (...args) => poolReady.then(p => p.execute(...args)),
  getConnection: (...args) => poolReady.then(p => p.getConnection(...args)),
  end: () => poolReady.then(p => p.end())
};

module.exports = pool;
