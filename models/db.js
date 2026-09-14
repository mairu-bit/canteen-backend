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
    conn.release();
  } catch (err) {
    console.error("[Migration] Migration check error:", err.message);
  }
})();

module.exports = pool;
