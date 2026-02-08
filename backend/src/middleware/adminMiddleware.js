function adminMiddleware(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!req.user || role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }
  next();
}

module.exports = adminMiddleware;
