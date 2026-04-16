const FRACTION_CHARS = '\u00BC\u00BD\u00BE\u2150\u2151\u2152\u2153\u2154\u2155\u2156\u2157\u2158\u2159\u215A\u215B\u215C\u215D\u215E';
const FRACTION_SLASH = '\u2044';

const MEASUREMENT_WORDS = new Set([
  'teaspoon', 'teaspoons', 'tsp', 'tsp.',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsp.',
  'cup', 'cups',
  'ounce', 'ounces', 'oz', 'oz.',
  'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
  'gram', 'grams', 'g', 'kg', 'kilogram', 'kilograms',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l',
  'pinch', 'pinches', 'dash', 'dashes', 'drop', 'drops',
  'clove', 'cloves', 'head', 'heads',
  'can', 'cans', 'jar', 'jars', 'package', 'packages', 'pkg', 'pkg.',
  'bunch', 'bunches', 'sprig', 'sprigs',
  'stick', 'sticks', 'slice', 'slices',
  'piece', 'pieces', 'chunk', 'chunks',
  'fillet', 'fillets', 'loaf', 'loaves'
]);

const PREP_WORDS = new Set([
  'divided', 'plus', 'more', 'for', 'serving', 'garnish', 'optional', 'to', 'taste',
  'finely', 'roughly', 'coarsely', 'thinly', 'thickly', 'lightly',
  'chopped', 'minced', 'sliced', 'diced', 'cubed', 'halved', 'quartered',
  'peeled', 'seeded', 'grated', 'shredded', 'drained', 'rinsed', 'packed',
  'room', 'temperature', 'melted', 'softened', 'beaten', 'crushed',
  'freshly', 'ground', 'cut', 'into', 'small', 'medium', 'large',
  'deveined', 'rolling', 'and'
]);

const SIZE_WORDS = new Set(['small', 'medium', 'large', 'extra-large', 'extra', 'tiny']);
const STOPWORDS = new Set(['of', 'a', 'an']);
const FRACTION_ONLY_RE = new RegExp(`^[${FRACTION_CHARS}]+$`);
const DESCRIPTOR_WORDS = new Set([
  'whole', 'kosher', 'unsalted', 'salted', 'plain', 'raw', 'ripe', 'fresh',
  'dried', 'dry', 'boneless', 'skinless', 'bone-in', 'packed', 'good-quality',
  'sturdy', 'extra-virgin', 'virgin', 'reduced-sodium', 'low-sodium',
  'full-fat', 'sharp', 'extra-sharp', 'soft', 'silken', 'center-cut',
  'new', 'additional', 'about', 'diameter', 'store-bought', 'mixed'
]);
const EQUIPMENT_NOUNS = new Set([
  'pan', 'skillet', 'pot', 'dish', 'rack', 'bowl', 'basket',
  'cutter', 'thermometer', 'mixer', 'processor', 'blender', 'jar',
  'container', 'griddle', 'grill', 'wok', 'tawa', 'knife', 'pestle',
  'mortar', 'board', 'cup'
]);

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIngredientLine(name) {
  return normalizeWhitespace(
    String(name || '')
      .replace(/\\/g, '')
      .replace(/^[\u2013\u2014\u2212-]+/, '')
      .replace(/^[\s"'\\\[]+/, '')
      .replace(/[\s"'\\\]]+$/, '')
  );
}

function stripParentheticalContent(text) {
  let value = text;
  let previous = null;
  while (value !== previous) {
    previous = value;
    value = value.replace(/\([^()]*\)/g, ' ');
  }
  return value.replace(/[()]/g, ' ');
}

function extractQuotedIngredients(text) {
  const matches = [];
  const pattern = /'([^']*)'/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) matches.push(match[1]);
  }
  return matches;
}

function splitIngredientLines(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map(normalizeIngredientLine).filter(Boolean);
  }

  const text = String(input || '').trim();
  if (!text) return [];

  const quoted = extractQuotedIngredients(text);
  if (quoted.length) {
    return quoted.map(normalizeIngredientLine).filter(Boolean);
  }

  return text
    .split(/\r?\n|[;]+/)
    .map(normalizeIngredientLine)
    .filter((item) => !/^note[:)\s]/i.test(item))
    .filter(Boolean);
}

function stripLeadingQuantity(text) {
  const numberPattern = `[\\d${FRACTION_CHARS}${FRACTION_SLASH}./-]+`;
  const quantityRegex = new RegExp(
    `^(?:about\\s+|approximately\\s+|approx\\.?\\s+)?(?:${numberPattern})(?:\\s*${numberPattern})*\\s*`
  );

  let value = text
    .replace(/^[\u2013\u2014\u2212-]+/, '')
    .replace(quantityRegex, '')
    .trim();
  value = value.replace(/^\(\s*/, '').trim();

  const words = value.split(/\s+/).filter(Boolean);
  while (words.length && SIZE_WORDS.has(words[0])) {
    words.shift();
  }
  while (words.length && MEASUREMENT_WORDS.has(words[0])) {
    words.shift();
  }

  return words.join(' ').trim();
}

function stripDescriptors(text) {
  let value = text;
  value = stripParentheticalContent(value);
  value = value.replace(/\[[^\]]*]/g, ' ');
  value = value.split(',')[0];
  value = value.replace(/["%]/g, ' ');
  value = value.replace(/:/g, ' ');
  value = value.replace(/\b(?:or|and\/or)\b.*$/i, '');
  value = value.replace(/\bfor serving\b.*$/i, '');
  value = value.replace(/\bto serve\b.*$/i, '');
  value = value.replace(/\boptional\b.*$/i, '');
  value = value.replace(/\bspecial equipment\b.*$/i, '');
  value = value.replace(/\baccompaniment\b.*$/i, '');
  value = normalizeWhitespace(value.toLowerCase());

  const words = value.split(/\s+/).filter(Boolean);
  const kept = [];
  for (const word of words) {
    if (PREP_WORDS.has(word)) continue;
    if (MEASUREMENT_WORDS.has(word)) continue;
    if (DESCRIPTOR_WORDS.has(word)) continue;
    if (new RegExp(`^[\\d${FRACTION_SLASH}./-]+$`).test(word)) continue;
    if (FRACTION_ONLY_RE.test(word)) continue;
    kept.push(word);
  }

  while (kept.length && STOPWORDS.has(kept[0])) {
    kept.shift();
  }

  return kept.join(' ').trim();
}

function singularizeBasic(word) {
  if (!word) return word;
  if (word.endsWith('leaves') && word.length > 6) return word;
  if (word.endsWith('ves') && word.length > 4) return `${word.slice(0, -3)}f`;
  if (word.endsWith('shes') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ches') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('xes') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('zes') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('ses') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function normalizeIngredientName(name) {
  const line = normalizeIngredientLine(name);
  if (!line) return '';
  if (/^note[:)\s]/i.test(line)) return '';

  let value = normalizeWhitespace(line.toLowerCase());
  value = stripDescriptors(value);
  value = stripLeadingQuantity(value);
  if (!value) return '';

  const words = value.split(/\s+/).filter(Boolean);
  const normalizedWords = words.map((word, index) => (
    index === words.length - 1 ? singularizeBasic(word) : word
  ));
  while (normalizedWords.length && STOPWORDS.has(normalizedWords[0])) {
    normalizedWords.shift();
  }
  const lastWord = normalizedWords[normalizedWords.length - 1];
  if (EQUIPMENT_NOUNS.has(lastWord)) return '';

  return normalizeWhitespace(normalizedWords.join(' '));
}

function splitIngredients(input) {
  return splitIngredientLines(input)
    .map((item) => ({
      display: normalizeIngredientLine(item),
      name: normalizeIngredientName(item)
    }))
    .filter((item) => item.display && item.name);
}

module.exports = {
  normalizeIngredientLine,
  normalizeIngredientName,
  splitIngredientLines,
  splitIngredients
};
