require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Pass io to routes
app.use((req, _res, next) => { req.io = io; next(); });

// Routes
app.use('/api/auth',    require('./routes/authRoutes'));
app.use('/api/shops',   require('./routes/shopRoutes'));
app.use('/api/menus',   require('./routes/menuRoutes'));
app.use('/api/orders',  require('./routes/orderRoutes'));
app.use('/api/queue',   require('./routes/queueRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/admin',   require('./routes/adminRoutes'));
app.use('/api/upload',  require('./routes/uploadRoutes'));

// Socket.io
io.on('connection', (socket) => {
  socket.on('join_shop', (shopId) => socket.join(`shop_${shopId}`));
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
