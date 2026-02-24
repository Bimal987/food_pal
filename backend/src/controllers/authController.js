const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  validateEmail,
  normalizeEmail,
  validatePassword,
  sanitizeText,
  hasSuspiciousInput,
  sendValidationError
} = require('../utils/validator');

async function register(req, res) {
  const rawName = req.body?.name;
  const rawEmail = req.body?.email;
  const rawPassword = req.body?.password;

  // Normalize all auth inputs first so validation is deterministic.
  const name = sanitizeText(rawName);
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword || '');

  // Collect all validation failures at once for better frontend UX/debugging.
  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');
  if (!password) errors.push('Password is required.');
  if (email && !validateEmail(email)) errors.push('Email format is invalid.');
  if (password && !validatePassword(password)) errors.push('Password must be at least 6 characters long.');
  if (name && hasSuspiciousInput(name)) errors.push('Name contains unsafe input.');

  if (errors.length) {
    return sendValidationError(res, errors);
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
  const rawEmail = req.body?.email;
  const rawPassword = req.body?.password;
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword || '');

  // Login keeps validation minimal but strict to avoid ambiguous auth queries.
  const errors = [];
  if (!email) errors.push('Email is required.');
  if (!password) errors.push('Password is required.');
  if (email && !validateEmail(email)) errors.push('Email format is invalid.');
  if (errors.length) return sendValidationError(res, errors);

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
