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

async function updateProfile(req, res) {
  const userId = req.user.id;
  const name = sanitizeText(req.body?.name);
  const email = normalizeEmail(req.body?.email);
  const errors = [];

  if (!name) errors.push('Full name is required.');
  if (!email) errors.push('Email is required.');
  if (email && !validateEmail(email)) errors.push('Email format is invalid.');
  if (name && hasSuspiciousInput(name)) errors.push('Name contains unsafe input.');
  if (errors.length) return sendValidationError(res, errors);

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = :email AND id <> :id',
    { email, id: userId }
  );
  if (existing.length) return res.status(409).json({ message: 'Email already registered' });

  await pool.query(
    'UPDATE users SET name = :name, email = :email WHERE id = :id',
    { name, email, id: userId }
  );

  return res.json({ message: 'Profile updated', user: { id: userId, name, email, role: req.user.role || 'user' } });
}

async function updatePassword(req, res) {
  const userId = req.user.id;
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  const errors = [];

  if (!oldPassword) errors.push('Old password is required.');
  if (!newPassword) errors.push('New password is required.');
  if (newPassword && !validatePassword(newPassword)) errors.push('New password must be at least 6 characters long.');
  if (newPassword !== confirmPassword) errors.push('New password and confirmation do not match.');
  if (errors.length) return sendValidationError(res, errors);

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = :id', { id: userId });
  if (!rows.length) return res.status(404).json({ message: 'User not found' });

  const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ message: 'Old password is incorrect' });

  const password_hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = :password_hash WHERE id = :id', { password_hash, id: userId });

  return res.json({ message: 'Password updated' });
}

async function deleteAccount(req, res) {
  const userId = req.user.id;
  const password = String(req.body?.password || '');
  if (!password) return sendValidationError(res, ['Password is required.']);

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = :id', { id: userId });
  if (!rows.length) return res.status(404).json({ message: 'User not found' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ message: 'Password is incorrect' });

  await pool.query('DELETE FROM users WHERE id = :id', { id: userId });
  return res.json({ message: 'Account deleted' });
}

module.exports = { register, login, getProfile, updateProfile, updatePassword, deleteAccount };
