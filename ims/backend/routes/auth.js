const express = require('express');
const router = express.Router();
const { register, login, me, sendOtp, loginWithOtp } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/login-otp', loginWithOtp);
router.post('/send-otp', sendOtp);
router.get('/me', protect, me);

module.exports = router;
