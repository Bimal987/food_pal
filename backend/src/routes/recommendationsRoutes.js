const router = require('express').Router();
const { getRecommendations } = require('../controllers/recommendationsController');
const optionalAuth = require('../middleware/optionalAuthMiddleware');

router.get('/:recipeId', optionalAuth, getRecommendations);

module.exports = router;
