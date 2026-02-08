const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const userOnly = require('../middleware/userOnlyMiddleware');
const { addRating, updateRating, getUserRating, getMyRatings, getRecipeRatings } = require('../controllers/ratingsController');

router.get('/me', auth, userOnly, getMyRatings);
router.get('/recipe/:recipeId', getRecipeRatings);
router.get('/:recipeId', auth, userOnly, getUserRating);
router.post('/:recipeId', auth, userOnly, addRating);
router.put('/:recipeId', auth, userOnly, updateRating);

module.exports = router;
