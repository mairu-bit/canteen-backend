const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { auth, role } = require('../middlewares/authMiddleware');

router.post('/',                auth, role('buyer'),  ctrl.createOrder);
router.get('/history',          auth, role('buyer'),  ctrl.getHistory);
router.get('/vendor',           auth, role('vendor'), ctrl.getVendorOrders);
router.put('/:id/arrive',       auth, role('vendor'), ctrl.markArrived);
router.put('/:id/accept',       auth, role('vendor'), ctrl.acceptOrder);
router.put('/:id/complete',     auth, role('vendor'), ctrl.completeOrder);

module.exports = router;
