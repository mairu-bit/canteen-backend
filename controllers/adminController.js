const db = require('../models/db');

// GET /api/admin/shops/pending
exports.getPendingShops = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.*, u.name as owner_name, u.email FROM shops s
       JOIN users u ON u.id = s.user_id WHERE s.status='pending'`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/shops/:id/approve
exports.approveShop = async (req, res) => {
  try {
    await db.execute(`UPDATE shops SET status='approved', is_open=1 WHERE id=?`, [req.params.id]);
    res.json({ message: 'Shop approved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/shops/:id/reject
exports.rejectShop = async (req, res) => {
  try {
    await db.execute(`UPDATE shops SET status='rejected' WHERE id=?`, [req.params.id]);
    res.json({ message: 'Shop rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/stats — ภาพรวม
exports.getOverallStats = async (req, res) => {
  try {
    const [[summary]] = await db.execute(`
      SELECT
        COUNT(*) as total_orders,
        SUM(total_price) as total_revenue,
        AVG(TIMESTAMPDIFF(SECOND, accepted_at, completed_at)) as avg_seconds
      FROM orders WHERE status='completed'
    `);

    // เมนูขายดีภาพรวม
    const [topMenus] = await db.execute(`
      SELECT m.name, SUM(oi.quantity) as sold
      FROM order_items oi JOIN menus m ON m.id=oi.menu_id
      GROUP BY m.id ORDER BY sold DESC LIMIT 10
    `);

    // ชั่วโมงเร่งด่วน
    const [peakHours] = await db.execute(`
      SELECT HOUR(created_at) as hour, COUNT(*) as orders
      FROM orders GROUP BY hour ORDER BY hour
    `);

    // สถิติรายร้าน
    const [shopStats] = await db.execute(`
      SELECT s.name as shop_name,
        COUNT(o.id) as total_orders,
        SUM(o.total_price) as revenue,
        AVG(r.rating) as avg_rating
      FROM shops s
      LEFT JOIN orders o ON o.shop_id=s.id AND o.status='completed'
      LEFT JOIN reviews r ON r.shop_id=s.id
      WHERE s.status='approved'
      GROUP BY s.id
    `);

    res.json({ summary, topMenus, peakHours, shopStats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/reviews
exports.getAllReviews = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.*, u.name as buyer_name, s.name as shop_name
      FROM reviews r
      JOIN users u ON u.id=r.buyer_id
      JOIN shops s ON s.id=r.shop_id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
