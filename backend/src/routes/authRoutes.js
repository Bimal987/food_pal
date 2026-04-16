const router = require('express').Router();
const { register, login, getProfile, updateProfile, updatePassword, deleteAccount } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, getProfile);
router.put('/me', auth, updateProfile);
router.put('/password', auth, updatePassword);
router.delete('/me', auth, deleteAccount);

module.exports = router;
