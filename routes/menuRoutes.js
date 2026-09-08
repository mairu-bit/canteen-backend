const router = require('express').Router();
const db = require('../models/db');
const { auth, role } = require('../middlewares/authMiddleware');

// GET /api/menus/:shopId (public/buyer)
router.get('/:shopId', async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM menus WHERE shop_id=? AND is_available=1',
    [req.params.shopId]
  );
  res.json(rows);
});

// POST /api/menus
router.post('/', auth, role('vendor'), async (req, res) => {
  const { name, price, description, image_url } = req.body;
  const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);
  await db.execute(
    'INSERT INTO menus (shop_id, name, price, description, image_url) VALUES (?,?,?,?,?)',
    [shop.id, name, price, description, image_url || null]
  );
  res.status(201).json({ message: 'Menu created' });
});

// PUT /api/menus/:id
router.put('/:id', auth, role('vendor'), async (req, res) => {
  const { name, price, description, image_url, is_available } = req.body;
  await db.execute(
    'UPDATE menus SET name=?, price=?, description=?, image_url=?, is_available=? WHERE id=?',
    [name, price, description, image_url !== undefined ? image_url : null, is_available !== undefined ? is_available : 1, req.params.id]
  );
  res.json({ message: 'Updated' });
});

// DELETE /api/menus/:id
router.delete('/:id', auth, role('vendor'), async (req, res) => {
  await db.execute('DELETE FROM menus WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
