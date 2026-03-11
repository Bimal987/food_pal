const router = require('express').Router();
const { getRecommendations, getTopPick } = require('../controllers/recommendationsController');
const optionalAuth = require('../middleware/optionalAuthMiddleware');

router.get('/top-pick', optionalAuth, getTopPick);
router.get('/:recipeId', optionalAuth, getRecommendations);

module.exports = router;
