const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// GET /api/stats/vendor — ยอดขาย + เมนูขายดีของร้านตัวเอง
router.get('/vendor', auth, role('vendor'), async (req, res) => {
  const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);

  const [[summary]] = await db.execute(
    `SELECT COUNT(*) as total_orders, SUM(total_price) as revenue
     FROM orders WHERE shop_id=? AND status='completed'`,
    [shop.id]
  );

  const [topMenus] = await db.execute(
    `SELECT m.name, SUM(oi.quantity) as sold
     FROM order_items oi JOIN menus m ON m.id=oi.menu_id
     JOIN orders o ON o.id=oi.order_id
     WHERE o.shop_id=? AND o.status='completed'
     GROUP BY m.id ORDER BY sold DESC LIMIT 5`,
    [shop.id]
  );

  res.json({ summary, topMenus });
});

module.exports = router;
