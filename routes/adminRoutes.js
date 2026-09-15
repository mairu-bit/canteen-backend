const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { auth, role } = require('../middlewares/authMiddleware');

const guard = [auth, role('admin')];

// Shops
router.get('/shops/pending',      ...guard, ctrl.getPendingShops);
router.get('/shops',              ...guard, ctrl.getAllShops);
router.put('/shops/:id/approve',  ...guard, ctrl.approveShop);
router.put('/shops/:id/reject',   ...guard, ctrl.rejectShop);
router.put('/shops/:id/status',   ...guard, ctrl.updateShopStatus);
router.delete('/shops/:id',       ...guard, ctrl.deleteShop);

// Messages & Broadcasts
router.get('/messages',           ...guard, ctrl.getAdminMessages);
router.post('/messages',          ...guard, ctrl.sendAdminMessage);
router.delete('/messages/:id',    ...guard, ctrl.deleteAdminMessage);

// Stats & Reviews
router.get('/stats',              ...guard, ctrl.getOverallStats);
router.get('/reviews',            ...guard, ctrl.getAllReviews);

module.exports = router;
