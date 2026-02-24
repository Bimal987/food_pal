const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function validatePassword(password) {
  return typeof password === 'string' && password.trim().length >= 6;
}

function sanitizeText(text) {
  if (text === null || text === undefined) return '';
  let value = String(text);

  // Remove script blocks and generic HTML tags to avoid stored-XSS payloads.
  value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  value = value.replace(/<[^>]+>/g, '');

  // Remove control characters that can be abused in logs/parsers.
  value = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // Collapse excess horizontal whitespace but preserve line breaks.
  value = value.replace(/[ \t]+/g, ' ');

  return value.trim();
}

function validateLength(text, min = 0, max = Infinity) {
  const len = sanitizeText(text).length;
  return len >= min && len <= max;
}

function validateNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasSuspiciousInput(text) {
  const value = String(text || '');
  return /(--|\/\*|\*\/|;\s*(select|insert|update|delete|drop|union|alter|create)\b|\bunion\s+select\b|\bor\s+1\s*=\s*1\b|\band\s+1\s*=\s*1\b)/i.test(value);
}

function sendValidationError(res, errors, status = 400) {
  return res.status(status).json({
    message: 'Validation error',
    errors
  });
}

module.exports = {
  validateEmail,
  normalizeEmail,
  validatePassword,
  sanitizeText,
  validateLength,
  validateNumber,
  hasSuspiciousInput,
  sendValidationError
};
