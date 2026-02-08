const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function register(req, res) {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password are required' });
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = :email', { email });
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :password_hash, \'user\')',
    { name, email, password_hash }
  );

  return res.status(201).json({ message: 'Registered successfully' });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

  const [rows] = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = :email', { email });
  if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
}

async function getProfile(req, res) {
  // Return current user info from DB to ensure it's fresh
  const userId = req.user.id;
  const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = :id', { id: userId });
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  return res.json(rows[0]);
}

module.exports = { register, login, getProfile };
