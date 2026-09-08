const router = require('express').Router();
const db = require('../models/db');
const { auth } = require('../middlewares/authMiddleware');

// GET /api/queue/:shopId — ดูคิวสาธารณะของร้าน
router.get('/:shopId', async (req, res) => {
  const [rows] = await db.execute(
    `SELECT queue_number, status, created_at
     FROM orders WHERE shop_id=? AND status IN ('pending','accepted')
     ORDER BY queue_number ASC`,
    [req.params.shopId]
  );
  res.json(rows);
});

// GET /api/queue/my/:orderId — ดูสถานะคิวของตัวเอง
router.get('/my/:orderId', auth, async (req, res) => {
  const [[order]] = await db.execute(
    'SELECT queue_number, status, shop_id, table_no, is_arrived, arrived_at FROM orders WHERE id=? AND buyer_id=?',
    [req.params.orderId, req.user.id]
  );
  if (!order) return res.status(404).json({ message: 'Not found' });

  const [[{ ahead }]] = await db.execute(
    `SELECT COUNT(*) as ahead FROM orders
     WHERE shop_id=? AND queue_number < ? AND status IN ('pending','accepted')`,
    [order.shop_id, order.queue_number]
  );
  res.json({ ...order, ahead });
});

module.exports = router;
