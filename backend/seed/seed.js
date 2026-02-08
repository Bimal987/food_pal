/* eslint-disable no-console */
const pool = require('../src/config/db');
const { seedDatabase } = require('./seed-lib');

const shouldReset = process.argv.includes('--reset');

seedDatabase({ reset: shouldReset, log: true }).then(async () => {
  await pool.end();
}).catch(async (err) => {
  console.error('Seed failed:', err);
  try { await pool.end(); } catch (e) {}
  process.exit(1);
});
