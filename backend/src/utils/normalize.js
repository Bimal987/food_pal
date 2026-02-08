function normalizeIngredientName(name) {
  return (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function splitIngredients(text) {
  if (!text) return [];
  // split by commas or semicolons
  return text
    .split(/[,;]+/)
    .map(s => normalizeIngredientName(s))
    .filter(Boolean);
}

module.exports = { normalizeIngredientName, splitIngredients };
