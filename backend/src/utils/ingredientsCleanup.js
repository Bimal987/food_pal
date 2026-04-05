const { normalizeIngredientName } = require('./normalize');

async function mergeIngredient(pool, sourceId, targetId) {
  await pool.query(
    `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, display_text, sort_order)
     SELECT recipe_id, :targetId, display_text, sort_order
     FROM recipe_ingredients
     WHERE ingredient_id = :sourceId
     ON DUPLICATE KEY UPDATE
       display_text = COALESCE(recipe_ingredients.display_text, VALUES(display_text)),
       sort_order = LEAST(recipe_ingredients.sort_order, VALUES(sort_order))`,
    { sourceId, targetId }
  );
  await pool.query('DELETE FROM recipe_ingredients WHERE ingredient_id = :sourceId', { sourceId });
  await pool.query('DELETE FROM ingredients WHERE id = :sourceId', { sourceId });
}

async function removeIngredient(pool, ingredientId) {
  await pool.query('DELETE FROM recipe_ingredients WHERE ingredient_id = :ingredientId', { ingredientId });
  await pool.query('DELETE FROM ingredients WHERE id = :ingredientId', { ingredientId });
}

async function normalizeStoredIngredients(pool) {
  const [rows] = await pool.query('SELECT id, name FROM ingredients ORDER BY id ASC');
  let updated = 0;
  let merged = 0;
  let removed = 0;

  for (const row of rows) {
    const currentName = String(row.name || '').trim();
    const normalizedName = normalizeIngredientName(currentName);

    if (!normalizedName) {
      await removeIngredient(pool, row.id);
      removed += 1;
      continue;
    }

    if (normalizedName === currentName) continue;

    const [existing] = await pool.query(
      'SELECT id FROM ingredients WHERE name = :name AND id <> :id LIMIT 1',
      { name: normalizedName, id: row.id }
    );

    if (existing.length) {
      await mergeIngredient(pool, row.id, existing[0].id);
      merged += 1;
      continue;
    }

    await pool.query(
      'UPDATE ingredients SET name = :name WHERE id = :id',
      { name: normalizedName, id: row.id }
    );
    updated += 1;
  }

  return { updated, merged, removed };
}

module.exports = { normalizeStoredIngredients };
