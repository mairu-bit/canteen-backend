const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models/db');

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
      [name, email, hash, role === 'vendor' ? 'vendor' : 'buyer']
    );
    // If vendor -> create shop with pending status
    if (role === 'vendor') {
      await db.execute(
        'INSERT INTO shops (user_id, name, status, is_open) VALUES (?,?,?,?)',
        [result.insertId, req.body.shopName || name, 'pending', 0]
      );
    }
    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [[user]] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/fcm-token
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    await db.execute('UPDATE users SET fcm_token = ? WHERE id = ?', [fcm_token, req.user.id]);
    res.json({ message: 'FCM token updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
