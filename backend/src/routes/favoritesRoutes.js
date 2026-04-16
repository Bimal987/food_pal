const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const userOnly = require('../middleware/userOnlyMiddleware');
const { addFavorite, removeFavorite, setFavoriteTried, listFavorites } = require('../controllers/favoritesController');

router.use(auth, userOnly);

router.get('/', listFavorites);
router.post('/:recipeId', addFavorite);
router.patch('/:recipeId/tried', setFavoriteTried);
router.delete('/:recipeId', removeFavorite);

module.exports = router;
