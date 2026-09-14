const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// GET /api/stats/vendor — ยอดขาย + เมนูขายดีของร้านตัวเอง + ประวัติออเดอร์ล่าสุด
router.get('/vendor', auth, role('vendor'), async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    // ยอดขายรวมทั้งหมด (เฉพาะออเดอร์ที่ completed)
    const [[summary]] = await db.execute(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_price), 0) as revenue
       FROM orders WHERE shop_id=? AND status='completed'`,
      [shop.id]
    );

    // ยอดขายและออเดอร์วันนี้ (รองรับ Timezone UTC+7 ประเทศไทย)
    const [[todaySummary]] = await db.execute(
      `SELECT COUNT(*) as today_orders, COALESCE(SUM(total_price), 0) as today_revenue
       FROM orders WHERE shop_id=? AND status='completed'
       AND (
         DATE(CONVERT_TZ(COALESCE(completed_at, created_at), '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
         OR DATE(COALESCE(completed_at, created_at)) = CURDATE()
       )`,
      [shop.id]
    );

    // ออเดอร์ที่กำลังดำเนินการ (pending + accepted)
    const [[activeSummary]] = await db.execute(
      `SELECT COUNT(*) as active_orders
       FROM orders WHERE shop_id=? AND status IN ('pending', 'accepted')`,
      [shop.id]
    );

    // เมนูขายดี 5 อันดับแรก
    const [topMenus] = await db.execute(
      `SELECT m.name, SUM(oi.quantity) as sold, SUM(oi.quantity * oi.unit_price) as menu_revenue
       FROM order_items oi JOIN menus m ON m.id=oi.menu_id
       JOIN orders o ON o.id=oi.order_id
       WHERE o.shop_id=? AND o.status='completed'
       GROUP BY m.id, m.name ORDER BY sold DESC LIMIT 5`,
      [shop.id]
    );

    // รายการออเดอร์ที่เสร็จสิ้นล่าสุด 15 รายการ (Recent Completed Orders)
    const [recentOrders] = await db.execute(
      `SELECT o.id, o.queue_number, o.table_no, o.total_price, o.completed_at, o.created_at,
              COALESCE(o.customer_name, u.name) as buyer_name
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       WHERE o.shop_id=? AND o.status='completed'
       ORDER BY COALESCE(o.completed_at, o.created_at) DESC, o.id DESC LIMIT 15`,
      [shop.id]
    );

    for (const order of recentOrders) {
      const [items] = await db.execute(
        `SELECT oi.quantity, oi.unit_price, m.name as menu_name
         FROM order_items oi JOIN menus m ON m.id = oi.menu_id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    // สรุปคะแนนรีวิวร้านค้า
    const [[reviewSummary]] = await db.execute(
      `SELECT COUNT(*) as total_reviews, COALESCE(AVG(rating), 0) as avg_rating
       FROM reviews WHERE shop_id=?`,
      [shop.id]
    );

    res.json({
      summary: {
        total_orders: summary.total_orders || 0,
        revenue: Number(summary.revenue) || 0,
        today_orders: todaySummary.today_orders || 0,
        today_revenue: Number(todaySummary.today_revenue) || 0,
        active_orders: activeSummary.active_orders || 0,
        total_reviews: reviewSummary.total_reviews || 0,
        avg_rating: Number(Number(reviewSummary.avg_rating).toFixed(1)) || 0,
      },
      topMenus,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

