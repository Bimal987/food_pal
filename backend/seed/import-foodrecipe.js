/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const inputCsv = process.argv[2];
const imagesDir = process.argv[3];
const limit = parseInt(process.argv[4] || '500', 10);

if (!inputCsv || !imagesDir) {
  console.error('Usage: node import-foodrecipe.js <inputCsv> <imagesDir> [limit]');
  process.exit(1);
}

function normalizeKey(value) {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  const noExt = raw.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const noLead = noExt.replace(/^-+/, '');
  const noTailNum = noLead.replace(/-\d+$/, '');
  return noTailNum.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[,"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function loadImageMap(dir) {
  const files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const map = new Map();
  files.forEach((file) => {
    const key = normalizeKey(file);
    if (key && !map.has(key)) map.set(key, file);
  });
  return { files, map };
}

function findImageFile(imageName, files, map) {
  const key = normalizeKey(imageName);
  if (map.has(key)) return map.get(key);
  const direct = files.find((f) => f.toLowerCase() === `${imageName}`.toLowerCase());
  if (direct) return direct;
  const contains = files.find((f) => f.toLowerCase().includes(key));
  return contains || null;
}

async function run() {
  const outCsv = path.join(__dirname, 'recipes.csv');
  const outputImagesDir = path.join(__dirname, '..', 'public', 'images');
  fs.mkdirSync(outputImagesDir, { recursive: true });

  const { files, map } = loadImageMap(imagesDir);
  const rows = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(inputCsv)
      .pipe(csv({
        mapHeaders: ({ header }) => {
          const cleaned = (header || '').replace(/^\uFEFF/, '').trim();
          return cleaned.replace(/^"(.*)"$/, '$1');
        }
      }))
      .on('data', (data) => rows.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  const selected = [];
  const seenTitle = new Set();
  const seenImage = new Set();
  const seenIngredients = new Set();

  for (const row of rows) {
    if (selected.length >= limit) break;

    const title = (row.Title || row.title || '').trim();
    const ingredients = row.Ingredients || row.ingredients || '';
    const instructions = row.Instructions || row.instructions || '';
    const imageName = row.Image_Name || row.image_name || '';
    const cleanedIngredients = (row.Cleaned_Ingredients || '').toString().trim();

    if (!title || !imageName) continue;

    const imageFile = findImageFile(imageName, files, map);
    if (!imageFile) continue;

    const titleKey = title.toLowerCase();
    const imageKey = imageFile.toLowerCase();
    const ingKey = cleanedIngredients.toLowerCase();

    if (seenTitle.has(titleKey)) continue;
    if (seenImage.has(imageKey)) continue;
    if (ingKey && seenIngredients.has(ingKey)) continue;

    seenTitle.add(titleKey);
    seenImage.add(imageKey);
    if (ingKey) seenIngredients.add(ingKey);

    selected.push({
      title,
      description: '',
      steps: instructions,
      cook_time: '',
      difficulty: '',
      cuisine: '',
      veg_type: '',
      image_url: `/images/${imageFile}`,
      category: 'General',
      ingredients
    });
  }

  const header = [
    'title',
    'description',
    'steps',
    'cook_time',
    'difficulty',
    'cuisine',
    'veg_type',
    'image_url',
    'category',
    'ingredients'
  ];

  const lines = [header.join(',')];
  selected.forEach((r) => {
    lines.push(header.map((k) => csvEscape(r[k])).join(','));
  });

  fs.writeFileSync(outCsv, lines.join('\n'), 'utf8');

  // Copy images for selected recipes
  const copied = new Set();
  selected.forEach((r) => {
    const file = r.image_url.replace('/images/', '');
    if (copied.has(file)) return;
    copied.add(file);
    fs.copyFileSync(path.join(imagesDir, file), path.join(outputImagesDir, file));
  });

  console.log(`Selected ${selected.length} recipes.`);
  console.log(`Wrote CSV: ${outCsv}`);
  console.log(`Copied ${copied.size} images to ${outputImagesDir}`);
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
