const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const {
  createRecipe, updateRecipe, deleteRecipe,
  createCategory, updateCategory, deleteCategory,
  listAdminRecipes, getStats
} = require('../controllers/adminController');

router.use(auth, admin);

router.get('/stats', getStats);
router.get('/recipes', listAdminRecipes);
router.post('/recipes', createRecipe);
router.put('/recipes/:id', updateRecipe);
router.delete('/recipes/:id', deleteRecipe);

router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

module.exports = router;
