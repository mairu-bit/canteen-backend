const db = require('../models/db');

// GET /api/admin/shops/pending
exports.getPendingShops = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.*, u.name as owner_name, u.email FROM shops s
       JOIN users u ON u.id = s.user_id WHERE s.status='pending' ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/shops — ดูร้านค้าทั้งหมด
exports.getAllShops = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        s.*, 
        u.name as owner_name, 
        u.email as owner_email,
        COUNT(DISTINCT m.id) as menu_count,
        COUNT(DISTINCT CASE WHEN o.status='completed' THEN o.id END) as total_orders,
        COALESCE(SUM(CASE WHEN o.status='completed' THEN o.total_price END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.status='completed' THEN o.total_price END), 0) as revenue,
        AVG(r.rating) as avg_rating
      FROM shops s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN menus m ON m.shop_id = s.id
      LEFT JOIN orders o ON o.shop_id = s.id
      LEFT JOIN reviews r ON r.shop_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
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
    await db.execute(`UPDATE shops SET status='rejected', is_open=0 WHERE id=?`, [req.params.id]);
    res.json({ message: 'Shop rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/shops/:id/status — เปลี่ยนสถานะร้าน (approved, rejected, suspended, pending) / เปิด-ปิด
exports.updateShopStatus = async (req, res) => {
  try {
    const { status, is_open } = req.body;
    const updates = [];
    const params = [];
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (is_open !== undefined) {
      updates.push('is_open = ?');
      params.push(is_open ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    await db.execute(`UPDATE shops SET ${updates.join(', ')} WHERE id=?`, params);
    res.json({ message: 'Shop status updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/admin/shops/:id — ลบร้านค้า
exports.deleteShop = async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT * FROM shops WHERE id=?', [req.params.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    
    // Delete shop
    await db.execute('DELETE FROM shops WHERE id=?', [req.params.id]);
    res.json({ message: 'Shop deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/messages — ส่งข้อความ/ประกาศหาร้านค้า
exports.sendAdminMessage = async (req, res) => {
  try {
    const { shop_id, title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const [result] = await db.execute(
      'INSERT INTO admin_messages (sender_id, shop_id, title, message) VALUES (?, ?, ?, ?)',
      [req.user.id, shop_id ? parseInt(shop_id) : null, title.trim(), message.trim()]
    );

    const messageData = {
      id: result.insertId,
      sender_id: req.user.id,
      shop_id: shop_id ? parseInt(shop_id) : null,
      title: title.trim(),
      message: message.trim(),
      created_at: new Date()
    };

    // Emit via Socket.io
    if (req.io) {
      if (shop_id) {
        req.io.to(`shop_${shop_id}`).emit('admin_message', messageData);
      } else {
        req.io.emit('admin_message', messageData);
      }
    }

    res.status(201).json({ message: 'Message sent successfully', data: messageData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/messages — ดูประวัติข้อความที่ส่ง
exports.getAdminMessages = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        m.*,
        s.name as target_shop_name,
        u.name as sender_name,
        (SELECT COUNT(*) FROM admin_message_reads r WHERE r.message_id = m.id) as read_count
      FROM admin_messages m
      LEFT JOIN shops s ON s.id = m.shop_id
      JOIN users u ON u.id = m.sender_id
      ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/admin/messages/:id — ลบข้อความที่ส่ง
exports.deleteAdminMessage = async (req, res) => {
  try {
    await db.execute('DELETE FROM admin_messages WHERE id=?', [req.params.id]);
    res.json({ message: 'Message deleted' });
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
        COALESCE(SUM(total_price), 0) as revenue,
        COALESCE(SUM(total_price), 0) as total_revenue,
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
      SELECT 
        s.name as shop_name,
        COALESCE(ord.total_orders, 0) as total_orders,
        COALESCE(ord.revenue, 0) as revenue,
        COALESCE(ord.revenue, 0) as total_revenue,
        rev.avg_rating
      FROM shops s
      LEFT JOIN (
        SELECT shop_id, COUNT(*) as total_orders, SUM(total_price) as revenue
        FROM orders WHERE status='completed' GROUP BY shop_id
      ) ord ON ord.shop_id = s.id
      LEFT JOIN (
        SELECT shop_id, AVG(rating) as avg_rating
        FROM reviews GROUP BY shop_id
      ) rev ON rev.shop_id = s.id
      WHERE s.status='approved'
      ORDER BY total_orders DESC, revenue DESC
    `);

    res.json({
      summary: {
        total_orders: summary ? Number(summary.total_orders || 0) : 0,
        revenue: summary ? (Number(summary.revenue) || Number(summary.total_revenue) || 0) : 0,
        total_revenue: summary ? (Number(summary.total_revenue) || Number(summary.revenue) || 0) : 0,
        avg_seconds: summary?.avg_seconds ? Number(summary.avg_seconds) : 0
      },
      topMenus,
      peakHours,
      shopStats
    });
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
