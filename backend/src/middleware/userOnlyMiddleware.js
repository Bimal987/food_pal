function userOnlyMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized: missing user' });
  }

  const role = String(req.user.role || '').toLowerCase();
  if (role === 'admin') {
    return res.status(403).json({ message: 'Forbidden: user access only' });
  }

  next();
}

module.exports = userOnlyMiddleware;
