const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { auth, role } = require('../middlewares/authMiddleware');

const guard = [auth, role('admin')];

router.get('/shops/pending',    ...guard, ctrl.getPendingShops);
router.put('/shops/:id/approve',...guard, ctrl.approveShop);
router.put('/shops/:id/reject', ...guard, ctrl.rejectShop);
router.get('/stats',            ...guard, ctrl.getOverallStats);
router.get('/reviews',          ...guard, ctrl.getAllReviews);

module.exports = router;
