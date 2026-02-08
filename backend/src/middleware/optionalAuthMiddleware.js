const jwt = require('jsonwebtoken');

function optionalAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const [type, token] = auth.split(' ');
  if (type !== 'Bearer' || !token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role, name }
  } catch (err) {
    req.user = null;
  }

  return next();
}

module.exports = optionalAuthMiddleware;
