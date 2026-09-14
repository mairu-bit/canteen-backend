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
    `SELECT o.id, o.queue_number, o.status, o.shop_id, o.table_no, o.is_arrived, o.arrived_at, o.total_price, o.created_at,
            s.name as shop_name, COALESCE(o.customer_name, u.name) as buyer_name
     FROM orders o
     JOIN shops s ON s.id = o.shop_id
     JOIN users u ON u.id = o.buyer_id
     WHERE o.id=? AND o.buyer_id=?`,
    [req.params.orderId, req.user.id]
  );
  if (!order) return res.status(404).json({ message: 'Not found' });

  const [items] = await db.execute(
    `SELECT oi.*, m.name as menu_name FROM order_items oi
     JOIN menus m ON m.id = oi.menu_id
     WHERE oi.order_id = ?`,
    [order.id]
  );
  order.items = items;

  const [[{ ahead }]] = await db.execute(
    `SELECT COUNT(*) as ahead FROM orders
     WHERE shop_id=? AND queue_number < ? AND status IN ('pending','accepted')`,
    [order.shop_id, order.queue_number]
  );
  res.json({ ...order, ahead });
});

module.exports = router;
