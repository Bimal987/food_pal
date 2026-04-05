const router = require('express').Router();
const { listCuisines } = require('../controllers/cuisinesController');

router.get('/', listCuisines);

module.exports = router;
