require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cron = require('node-cron');
const connectDB = require('./config/db');
const { initNotifications, retryFailedNotifications } = require('./utils/notifications');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const auditValidationService = require('./services/auditValidationService');

// Global error handlers - log but don't shutdown immediately
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥');
  console.error(err.name, err.message, err.stack);
  // Don't exit - let the server continue running
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥');
  console.error(err.name, err.message, err.stack);
  // Don't exit - let the server continue running
});

console.log('[STARTUP] Initializing IMS Backend Server...');

// CORS configuration - more permissive for localhost development
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:5002',
  'http://localhost',
  'null',  // Allow requests with no origin (e.g., from file://)
];

// Add production frontend URL from env
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add Vercel preview deployments (optional - allows all vercel.app subdomains)
if (process.env.CORS_ORIGIN === '*') {
  console.log('[CORS] Allowing all origins (* mode)');
}

const corsOrigin = function (origin, callback) {
  // Allow requests with no origin (e.g., mobile apps, Postman, or curl)
  if (!origin) {
    return callback(null, true);
  }
  
  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  
  // Check if environment variable allows all origins
  if (process.env.CORS_ORIGIN === '*') {
    return callback(null, true);
  }
  
  console.warn('[CORS] Blocked origin:', origin);
  callback(new Error('Not allowed by CORS'));
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: corsOrigin, 
    credentials: true, 
    methods: ['GET','POST','PUT','PATCH','DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  // Add reconnection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'] // Allow fallback to polling
});

// Socket.io connection logging
io.on('connection', (socket) => {
  console.log('[SOCKET] Client connected:', socket.id);
  
  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Client disconnected:', socket.id, reason);
  });
  
  socket.on('error', (error) => {
    console.error('[SOCKET] Socket error:', error);
  });
});

console.log('[STARTUP] HTTP Server created');
console.log('[STARTUP] Socket.io Server created');

// Initialize notifications
console.log('[STARTUP] Initializing notification system...');
initNotifications(io);
console.log('[STARTUP] Notification system initialized');

// Connect to database
console.log('[STARTUP] Connecting to MongoDB...');
connectDB();

// Apply CORS to all routes
app.use(cors({ 
  origin: corsOrigin, 
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('socketio', io);

console.log('[STARTUP] Middleware configured');

// Apply rate limiting
console.log('[STARTUP] Loading routes...');
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/users', apiLimiter, require('./routes/users'));
app.use('/api/investors', apiLimiter, require('./routes/investors'));
app.use('/api/kyc', apiLimiter, require('./routes/kyc'));
app.use('/api/securities', apiLimiter, require('./routes/securities'));
app.use('/api/allocations', apiLimiter, require('./routes/allocations'));
app.use('/api/holdings', apiLimiter, require('./routes/holdings'));
app.use('/api/transfers', apiLimiter, require('./routes/transfers'));
app.use('/api/dividends', apiLimiter, require('./routes/dividends'));
app.use('/api/dashboard', apiLimiter, require('./routes/dashboard'));
app.use('/api/audit', apiLimiter, require('./routes/audit'));
app.use('/api/complaints', apiLimiter, require('./routes/complaints'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/errors', require('./routes/errors'));
console.log('[STARTUP] All routes loaded');

app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// Handle 404 errors
app.use(notFound);

// Handle all other errors
app.use(errorHandler);

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`[STARTUP] ✅ Server listening on port ${PORT}`);
  console.log(`[STARTUP] ✅ Server is ready to accept requests`);

  // Background retry worker - run every 1 minute
  cron.schedule('* * * * *', async () => {
    console.log('[CRON] Running background notification retry worker...');
    try {
      await retryFailedNotifications();
    } catch (err) {
      console.error('[CRON] Error in background retry worker:', err);
    }
  });

  console.log('[CRON] Background retry worker scheduled (every 1 minute)');

  // Background audit reconciliation - DISABLED TEMPORARILY due to null reference errors
  // TODO: Fix audit validation service to handle null cases properly
  console.log('[CRON] Background audit reconciliation DISABLED');
});
