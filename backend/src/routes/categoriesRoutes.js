const router = require('express').Router();
const { listCategories } = require('../controllers/categoriesController');

router.get('/', listCategories);

module.exports = router;
