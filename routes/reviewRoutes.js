const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// POST /api/reviews — ลูกค้าส่งรีวิวหลังจากได้รับอาหาร
router.post('/', auth, role('buyer'), async (req, res) => {
  try {
    const { order_id, rating, comment } = req.body;
    const [[order]] = await db.execute(
      'SELECT o.*, COALESCE(o.customer_name, u.name) as buyer_name FROM orders o JOIN users u ON u.id=o.buyer_id WHERE o.id=? AND o.buyer_id=? AND o.status="completed"',
      [order_id, req.user.id]
    );
    if (!order) return res.status(400).json({ message: 'Order not found or not completed' });

    // ตรวจสอบว่าเคยรีวิวออเดอร์นี้ไปแล้วหรือไม่
    const [[existing]] = await db.execute('SELECT id FROM reviews WHERE order_id=?', [order_id]);
    if (existing) {
      await db.execute(
        'UPDATE reviews SET rating=?, comment=?, created_at=NOW() WHERE id=?',
        [rating, comment || null, existing.id]
      );
    } else {
      await db.execute(
        'INSERT INTO reviews (order_id, buyer_id, shop_id, rating, comment) VALUES (?,?,?,?,?)',
        [order_id, req.user.id, order.shop_id, rating, comment || null]
      );
    }

    // แจ้งเตือนร้านค้าผ่าน Socket.io แบบ Real-time
    if (req.io) {
      req.io.to(`shop_${order.shop_id}`).emit('new_review', {
        shop_id: order.shop_id,
        order_id,
        rating: Number(rating),
        comment: comment || '',
        buyer_name: order.buyer_name || 'ลูกค้า'
      });
      req.io.to(`shop_${order.shop_id}`).emit('queue_update', { shop_id: order.shop_id });
    }

    res.status(201).json({ message: 'Review submitted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reviews/vendor — ร้านค้าดูรีวิวของร้านตัวเองทั้งหมด พร้อมสถิติดาว
router.get('/vendor', auth, role('vendor'), async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT id, name FROM shops WHERE user_id=?', [req.user.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    // สรุปสถิติดาวและรีวิว
    const [[summary]] = await db.execute(
      `SELECT
        COUNT(*) as total_reviews,
        COALESCE(AVG(rating), 0) as avg_rating,
        COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) as stars_5,
        COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0) as stars_4,
        COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0) as stars_3,
        COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0) as stars_2,
        COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) as stars_1
       FROM reviews WHERE shop_id=?`,
      [shop.id]
    );

    // ดึงรายการรีวิวทั้งหมดเรียงจากใหม่ไปเก่า
    const [reviews] = await db.execute(
      `SELECT r.id, r.order_id, r.rating, r.comment, r.created_at,
              COALESCE(o.customer_name, u.name) as buyer_name,
              o.queue_number, o.table_no, o.total_price
       FROM reviews r
       JOIN users u ON u.id = r.buyer_id
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.shop_id = ?
       ORDER BY r.created_at DESC`,
      [shop.id]
    );

    // ดึงรายการเมนูของแต่ละออเดอร์ที่ถูกรีวิว
    for (const rev of reviews) {
      if (rev.order_id) {
        const [items] = await db.execute(
          `SELECT oi.quantity, m.name as menu_name
           FROM order_items oi JOIN menus m ON m.id = oi.menu_id
           WHERE oi.order_id = ?`,
          [rev.order_id]
        );
        rev.items = items;
      } else {
        rev.items = [];
      }
    }

    res.json({
      shop,
      summary: {
        total_reviews: summary.total_reviews || 0,
        avg_rating: Number(Number(summary.avg_rating).toFixed(1)) || 0,
        stars: {
          5: Number(summary.stars_5) || 0,
          4: Number(summary.stars_4) || 0,
          3: Number(summary.stars_3) || 0,
          2: Number(summary.stars_2) || 0,
          1: Number(summary.stars_1) || 0,
        }
      },
      reviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reviews/:shopId — ลูกค้าหรือบุคคลทั่วไปดูรีวิวของร้านค้านั้นๆ
router.get('/:shopId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.*, COALESCE(o.customer_name, u.name) as buyer_name
       FROM reviews r
       JOIN users u ON u.id=r.buyer_id
       LEFT JOIN orders o ON o.id=r.order_id
       WHERE r.shop_id=? ORDER BY r.created_at DESC`,
      [req.params.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
