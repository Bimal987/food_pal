const router = require('express').Router();
const { listRecipes, getRecipeById, listRecipesByIngredients, getIngredientRecommendations } = require('../controllers/recipesController');

router.get('/', listRecipes);
router.get('/by-ingredients', listRecipesByIngredients);
router.get('/ingredients/recommendations', getIngredientRecommendations);
router.get('/:id', getRecipeById);

module.exports = router;
