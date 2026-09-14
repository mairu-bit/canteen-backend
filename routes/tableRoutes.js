const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// GET /api/tables — ดึงสถานะโต๊ะทั้งหมดในโรงอาหาร (Public / All users)
router.get('/', async (req, res) => {
  try {
    const [tables] = await db.execute(
      `SELECT t.*,
              u.name as buyer_name,
              TIMESTAMPDIFF(MINUTE, t.occupied_at, NOW()) as minutes_occupied
       FROM canteen_tables t
       LEFT JOIN users u ON u.id = t.current_buyer_id
       ORDER BY t.id ASC`
    );
    res.json(tables);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tables/my-session — ตรวจสอบว่าผู้ซื้อคนนี้กำลังมีโต๊ะที่นั่งอยู่หรือไม่ (สำหรับ Auto-fill โต๊ะเดิม)
router.get('/my-session', auth, async (req, res) => {
  try {
    // 1. ตรวจสอบจาก canteen_tables โดยตรง
    const [[tableSession]] = await db.execute(
      `SELECT * FROM canteen_tables WHERE current_buyer_id = ? AND status = 'occupied' LIMIT 1`,
      [req.user.id]
    );

    if (tableSession) {
      return res.json({
        has_session: true,
        table_no: tableSession.table_no,
        customer_name: tableSession.current_customer_name,
        occupied_at: tableSession.occupied_at
      });
    }

    // 2. ถ้าไม่มีใน canteen_tables ให้ตรวจสอบจากออเดอร์ล่าสุดที่ยังไม่เสร็จ (pending / accepted)
    const [[recentActiveOrder]] = await db.execute(
      `SELECT table_no, customer_name, created_at, is_arrived
       FROM orders
       WHERE buyer_id = ? AND status IN ('pending', 'accepted') AND table_no IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );

    if (recentActiveOrder && recentActiveOrder.table_no) {
      return res.json({
        has_session: true,
        table_no: recentActiveOrder.table_no,
        customer_name: recentActiveOrder.customer_name,
        is_arrived: recentActiveOrder.is_arrived === 1,
        occupied_at: recentActiveOrder.created_at
      });
    }

    res.json({ has_session: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/tables/:tableNo/clear — ร้านค้าหรือแอดมินกด "ลูกค้าลุกแล้ว (เคลียร์โต๊ะว่าง)"
router.put('/:tableNo/clear', auth, role('vendor', 'admin'), async (req, res) => {
  try {
    const tableNo = decodeURIComponent(req.params.tableNo);

    await db.execute(
      `UPDATE canteen_tables
       SET status = 'available', current_buyer_id = NULL, current_customer_name = NULL, occupied_at = NULL
       WHERE table_no = ?`,
      [tableNo]
    );

    // แจ้งเตือนทุกคนผ่าน Socket.io แบบ Real-time
    if (req.io) {
      req.io.emit('table_update', { table_no: tableNo, status: 'available' });
      req.io.emit('queue_update', {});
    }

    res.json({ message: `เคลียร์ ${tableNo} ให้เป็นโต๊ะว่างเรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/tables/:tableNo/occupy — กำหนดให้โต๊ะนี้ไม่ว่าง
router.put('/:tableNo/occupy', auth, async (req, res) => {
  try {
    const tableNo = decodeURIComponent(req.params.tableNo);
    const { customer_name } = req.body;

    await db.execute(
      `INSERT INTO canteen_tables (table_no, status, current_buyer_id, current_customer_name, occupied_at)
       VALUES (?, 'occupied', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE status='occupied', current_buyer_id=?, current_customer_name=?, occupied_at=NOW()`,
      [tableNo, req.user.id, customer_name || null, req.user.id, customer_name || null]
    );

    if (req.io) {
      req.io.emit('table_update', { table_no: tableNo, status: 'occupied' });
    }

    res.json({ message: `จองและเข้าใช้ ${tableNo} สำเร็จ` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
