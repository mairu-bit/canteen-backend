const db = require('../models/db');

// POST /api/orders — สั่งอาหาร
exports.createOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { shop_id, items, table_no, customer_name } = req.body; // items: [{menu_id, quantity}]

    // ดึงชื่อลูกค้าเริ่มต้นจาก users ถ้าไม่ได้ส่งมา
    let finalCustomerName = customer_name ? customer_name.trim() : null;
    if (!finalCustomerName) {
      const [[user]] = await conn.execute('SELECT name FROM users WHERE id=?', [req.user.id]);
      finalCustomerName = user ? user.name : 'ลูกค้าทั่วไป';
    }

    // ป้องกันการกดย้ำ (Double-Click Anti-Spam Cooldown 4 วินาที)
    const [[recentDuplicate]] = await conn.execute(
      `SELECT id, queue_number, table_no, customer_name
       FROM orders
       WHERE buyer_id=? AND shop_id=? AND status='pending'
       AND created_at >= (NOW() - INTERVAL 4 SECOND)
       ORDER BY id DESC LIMIT 1`,
      [req.user.id, shop_id]
    );
    if (recentDuplicate) {
      await conn.commit();
      return res.status(200).json({
        order_id: recentDuplicate.id,
        queue_number: recentDuplicate.queue_number,
        table_no: recentDuplicate.table_no,
        customer_name: recentDuplicate.customer_name,
        duplicate_prevented: true
      });
    }

    // คำนวณ queue number (pending+accepted ของร้านนั้น + 1)
    const [[{ q }]] = await conn.execute(
      `SELECT COUNT(*) as q FROM orders WHERE shop_id=? AND status IN ('pending','accepted')`,
      [shop_id]
    );
    const queue_number = q + 1;

    // คำนวณราคารวม
    let total = 0;
    for (const item of items) {
      const [[menu]] = await conn.execute('SELECT price FROM menus WHERE id=?', [item.menu_id]);
      total += menu.price * item.quantity;
    }

    const [order] = await conn.execute(
      'INSERT INTO orders (buyer_id, shop_id, queue_number, total_price, table_no, customer_name, is_arrived) VALUES (?,?,?,?,?,?,0)',
      [req.user.id, shop_id, queue_number, total, table_no || null, finalCustomerName]
    );

    for (const item of items) {
      const [[menu]] = await conn.execute('SELECT price FROM menus WHERE id=?', [item.menu_id]);
      await conn.execute(
        'INSERT INTO order_items (order_id, menu_id, quantity, unit_price) VALUES (?,?,?,?)',
        [order.insertId, item.menu_id, item.quantity, menu.price]
      );
    }

    await conn.commit();

    // Emit queue update
    req.io.to(`shop_${shop_id}`).emit('queue_update', { shop_id });

    res.status(201).json({
      order_id: order.insertId,
      queue_number,
      table_no,
      customer_name: finalCustomerName
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// GET /api/orders/active — ดึงออเดอร์ที่ยังไม่เสร็จสิ้นของผู้ซื้อ (สำหรับแถบติดตามสถานะ)
exports.getActiveOrders = async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT o.*, s.name as shop_name, COALESCE(o.customer_name, u.name) as buyer_name
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN users u ON u.id = o.buyer_id
       WHERE o.buyer_id = ? AND o.status IN ('pending', 'accepted')
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    for (const order of orders) {
      const [items] = await db.execute(
        `SELECT oi.*, m.name as menu_name FROM order_items oi
         JOIN menus m ON m.id = oi.menu_id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;

      const [[{ ahead }]] = await db.execute(
        `SELECT COUNT(*) as ahead FROM orders
         WHERE shop_id=? AND queue_number < ? AND status IN ('pending','accepted')`,
        [order.shop_id, order.queue_number]
      );
      order.ahead = ahead;
    }

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/orders/history — ประวัติผู้ซื้อ
exports.getHistory = async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT o.*, s.name as shop_name, COALESCE(o.customer_name, u.name) as buyer_name
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN users u ON u.id = o.buyer_id
       WHERE o.buyer_id = ? ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    for (const order of orders) {
      const [items] = await db.execute(
        `SELECT oi.*, m.name as menu_name FROM order_items oi
         JOIN menus m ON m.id = oi.menu_id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/orders/vendor — ออเดอร์ของร้าน
exports.getVendorOrders = async (req, res) => {
  try {
    const [[shop]] = await db.execute('SELECT id FROM shops WHERE user_id=?', [req.user.id]);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const [orders] = await db.execute(
      `SELECT o.*, COALESCE(o.customer_name, u.name) as buyer_name FROM orders o
       JOIN users u ON u.id = o.buyer_id
       WHERE o.shop_id = ? AND o.status IN ('pending','accepted')
       ORDER BY o.queue_number ASC`,
      [shop.id]
    );

    // ดึงรายการอาหารของแต่ละออเดอร์
    for (const order of orders) {
      const [items] = await db.execute(
        `SELECT oi.*, m.name as menu_name FROM order_items oi
         JOIN menus m ON m.id = oi.menu_id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/orders/:id/arrive — ร้านหรือลูกค้ากด "ลูกค้ามาโต๊ะแล้ว"
exports.markArrived = async (req, res) => {
  try {
    const [[order]] = await db.execute('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // ถ้าเป็นผู้ซื้อ ต้องเป็นเจ้าของออเดอร์นั้น
    if (req.user.role === 'buyer' && order.buyer_id !== req.user.id) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ในออเดอร์นี้' });
    }

    await db.execute(
      `UPDATE orders SET is_arrived=1, arrived_at=NOW() WHERE id=?`,
      [req.params.id]
    );

    req.io.to(`shop_${order.shop_id}`).emit('queue_update', { shop_id: order.shop_id });
    res.json({ message: 'ลูกค้ามาถึงโต๊ะแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/orders/:id/accept — ร้านกดรับออเดอร์ (ต้องลูกค้ามาโต๊ะแล้ว)
exports.acceptOrder = async (req, res) => {
  try {
    const [[order]] = await db.execute('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!order.is_arrived) {
      return res.status(400).json({ message: 'ลูกค้ายังไม่มาถึงโต๊ะ ไม่สามารถรับออเดอร์ได้' });
    }

    await db.execute(
      `UPDATE orders SET status='accepted', accepted_at=NOW() WHERE id=?`,
      [req.params.id]
    );
    req.io.to(`shop_${order.shop_id}`).emit('queue_update', { shop_id: order.shop_id });
    res.json({ message: 'Order accepted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/orders/:id/complete — ร้านกดเสร็จ
exports.completeOrder = async (req, res) => {
  try {
    await db.execute(
      `UPDATE orders SET status='completed', completed_at=NOW() WHERE id=?`,
      [req.params.id]
    );
    const [[order]] = await db.execute('SELECT shop_id FROM orders WHERE id=?', [req.params.id]);
    if (order) {
      req.io.to(`shop_${order.shop_id}`).emit('queue_update', { shop_id: order.shop_id });
    }
    res.json({ message: 'Order completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
