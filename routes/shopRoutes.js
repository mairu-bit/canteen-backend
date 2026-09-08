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

module.exports = router;
