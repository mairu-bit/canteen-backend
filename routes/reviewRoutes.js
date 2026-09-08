const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// POST /api/reviews
router.post('/', auth, role('buyer'), async (req, res) => {
  const { order_id, rating, comment } = req.body;
  const [[order]] = await db.execute(
    'SELECT * FROM orders WHERE id=? AND buyer_id=? AND status="completed"',
    [order_id, req.user.id]
  );
  if (!order) return res.status(400).json({ message: 'Order not found or not completed' });
  await db.execute(
    'INSERT INTO reviews (order_id, buyer_id, shop_id, rating, comment) VALUES (?,?,?,?,?)',
    [order_id, req.user.id, order.shop_id, rating, comment]
  );
  res.status(201).json({ message: 'Review submitted' });
});

// GET /api/reviews/:shopId — รีวิวของร้าน
router.get('/:shopId', async (req, res) => {
  const [rows] = await db.execute(
    `SELECT r.*, u.name as buyer_name FROM reviews r
     JOIN users u ON u.id=r.buyer_id
     WHERE r.shop_id=? ORDER BY r.created_at DESC`,
    [req.params.shopId]
  );
  res.json(rows);
});

module.exports = router;
