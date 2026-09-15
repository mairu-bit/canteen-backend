const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// GET /api/shops — ดูร้านที่ approved ทั้งหมด (public/buyer)
router.get('/', async (req, res) => {
  const [rows] = await db.execute(
    `SELECT s.*, AVG(r.rating) as avg_rating
     FROM shops s LEFT JOIN reviews r ON r.shop_id=s.id
     WHERE s.status='approved' GROUP BY s.id`
  );
  res.json(rows);
});

// GET /api/shops/my — ข้อมูลร้านของ vendor
router.get('/my', auth, role('vendor'), async (req, res) => {
  const [[shop]] = await db.execute('SELECT * FROM shops WHERE user_id=?', [req.user.id]);
  res.json(shop);
});

// PUT /api/shops/toggle — เปิด/ปิดร้าน
router.put('/toggle', auth, role('vendor'), async (req, res) => {
  const [[shop]] = await db.execute('SELECT * FROM shops WHERE user_id=?', [req.user.id]);
  await db.execute('UPDATE shops SET is_open=? WHERE id=?', [!shop.is_open, shop.id]);
  res.json({ is_open: !shop.is_open });
});

// PUT /api/shops/my — แก้ไขข้อมูลร้าน
router.put('/my', auth, role('vendor'), async (req, res) => {
  const { name, description, image_url } = req.body;
  await db.execute('UPDATE shops SET name=?, description=?, image_url=? WHERE user_id=?',
    [name, description, image_url !== undefined ? image_url : null, req.user.id]);
  res.json({ message: 'Updated' });
});

// GET /api/shops/my/messages — ข้อความและประกาศจาก Admin ถึงร้านค้านี้
router.get('/my/messages', auth, role('vendor'), async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    
    const [rows] = await db.execute(`
      SELECT 
        m.*,
        u.name as sender_name,
        CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read,
        r.read_at
      FROM admin_messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN admin_message_reads r ON r.message_id = m.id AND r.shop_id = ?
      WHERE m.shop_id = ? OR m.shop_id IS NULL
      ORDER BY m.created_at DESC
    `, [shop.id, shop.id]);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/shops/my/messages/:id/read — มาร์กข้อความว่าอ่านแล้ว
router.put('/my/messages/:id/read', auth, role('vendor'), async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    
    await db.execute(`
      INSERT INTO admin_message_reads (message_id, shop_id, read_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE read_at = NOW()
    `, [req.params.id, shop.id]);
    
    res.json({ message: 'Message marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
