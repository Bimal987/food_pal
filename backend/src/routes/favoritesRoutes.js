const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const userOnly = require('../middleware/userOnlyMiddleware');
const { addFavorite, removeFavorite, listFavorites } = require('../controllers/favoritesController');

router.use(auth, userOnly);

router.get('/', listFavorites);
router.post('/:recipeId', addFavorite);
router.delete('/:recipeId', removeFavorite);

module.exports = router;
