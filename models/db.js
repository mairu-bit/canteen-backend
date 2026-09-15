const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      process.env.DB_SSL === 'true' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
});

// Auto-migration for new columns in orders table
(async () => {
  try {
    const conn = await pool.getConnection();
    const [tableCols] = await conn.execute("SHOW COLUMNS FROM orders LIKE 'table_no'");
    if (tableCols.length === 0) {
      await conn.execute("ALTER TABLE orders ADD COLUMN table_no VARCHAR(50) DEFAULT NULL");
      console.log("[Migration] Added 'table_no' column to orders");
    }
    const [arrivedCols] = await conn.execute("SHOW COLUMNS FROM orders LIKE 'is_arrived'");
    if (arrivedCols.length === 0) {
      await conn.execute("ALTER TABLE orders ADD COLUMN is_arrived TINYINT(1) NOT NULL DEFAULT 0");
      console.log("[Migration] Added 'is_arrived' column to orders");
    }
    const [arrivedAtCols] = await conn.execute("SHOW COLUMNS FROM orders LIKE 'arrived_at'");
    if (arrivedAtCols.length === 0) {
      await conn.execute("ALTER TABLE orders ADD COLUMN arrived_at DATETIME DEFAULT NULL");
      console.log("[Migration] Added 'arrived_at' column to orders");
    }
    const [customerNameCols] = await conn.execute("SHOW COLUMNS FROM orders LIKE 'customer_name'");
    if (customerNameCols.length === 0) {
      await conn.execute("ALTER TABLE orders ADD COLUMN customer_name VARCHAR(100) DEFAULT NULL");
      console.log("[Migration] Added 'customer_name' column to orders");
    }
    const [menuImageCols] = await conn.execute("SHOW COLUMNS FROM menus LIKE 'image_url'");
    if (menuImageCols.length === 0) {
      await conn.execute("ALTER TABLE menus ADD COLUMN image_url TEXT DEFAULT NULL");
      console.log("[Migration] Added 'image_url' column to menus");
    }
    const [shopImageCols] = await conn.execute("SHOW COLUMNS FROM shops LIKE 'image_url'");
    if (shopImageCols.length === 0) {
      await conn.execute("ALTER TABLE shops ADD COLUMN image_url TEXT DEFAULT NULL");
      console.log("[Migration] Added 'image_url' column to shops");
    }

    // Create canteen_tables table if not exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS canteen_tables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_no VARCHAR(50) NOT NULL UNIQUE,
        status ENUM('available', 'occupied') NOT NULL DEFAULT 'available',
        current_buyer_id INT DEFAULT NULL,
        current_customer_name VARCHAR(100) DEFAULT NULL,
        occupied_at DATETIME DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Seed default canteen tables
    const [existingTables] = await conn.execute("SELECT COUNT(*) as cnt FROM canteen_tables");
    if (existingTables[0].cnt === 0) {
      const defaultTables = ['โต๊ะ 1', 'โต๊ะ 2', 'โต๊ะ 3', 'โต๊ะ 4', 'โต๊ะ 5', 'โต๊ะ 6'];
      for (const t of defaultTables) {
        await conn.execute("INSERT IGNORE INTO canteen_tables (table_no, status) VALUES (?, 'available')", [t]);
      }
      console.log("[Migration] Seeded default canteen tables");
    }

    // Create admin_messages table if not exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admin_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        shop_id INT DEFAULT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create admin_message_reads table if not exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admin_message_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        shop_id INT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_read (message_id, shop_id),
        FOREIGN KEY (message_id) REFERENCES admin_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
      )
    `);

    conn.release();
  } catch (err) {
    console.error("[Migration] Migration check error:", err.message);
  }
})();

module.exports = pool;
