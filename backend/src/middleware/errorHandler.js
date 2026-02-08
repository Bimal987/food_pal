function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line
  console.error(err);
  res.status(500).json({ message: 'Server error', error: err.message });
}

module.exports = { notFound, errorHandler };
