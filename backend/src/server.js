const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const authRoutes = require('./routes/authRoutes');
const recipesRoutes = require('./routes/recipesRoutes');
const categoriesRoutes = require('./routes/categoriesRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const ratingsRoutes = require('./routes/ratingsRoutes');
const recoRoutes = require('./routes/recommendationsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ingredientsRoutes = require('./routes/ingredientsRoutes');
const { ensureSeededIfEmpty } = require('../seed/seed-lib');

const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));

app.get('/', (req, res) => {
  res.json({ message: 'Recipe Recommendation System API', status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/recommendations', recoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ingredients', ingredientsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const result = await ensureSeededIfEmpty();
    if (result?.seeded) {
      console.log(`Auto-seeded recipes. Total recipes: ${result.total}`);
    }
  } catch (err) {
    console.log('Auto-seed skipped:', err.message);
  }

  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
