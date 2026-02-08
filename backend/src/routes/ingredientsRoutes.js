const router = require('express').Router();
const { listIngredients } = require('../controllers/ingredientsController');

router.get('/', listIngredients);

module.exports = router;
