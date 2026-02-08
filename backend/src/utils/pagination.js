function getPagination(query) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '12', 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = { getPagination };
