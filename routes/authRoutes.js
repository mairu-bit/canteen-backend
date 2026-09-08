const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { auth } = require('../middlewares/authMiddleware');

router.post('/register',   ctrl.register);
router.post('/login',      ctrl.login);
router.put('/fcm-token',   auth, ctrl.updateFcmToken);

module.exports = router;
