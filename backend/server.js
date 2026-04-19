/**
 * server.js - Application Entry Point
 * Sets up Express app, middleware, routes, and starts the server.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Security imports
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// Route imports
const authRoutes = require('./routes/authRoutes');
const queueRoutes = require('./routes/queueRoutes');
const stallRoutes = require('./routes/stallRoutes');
const eventRoutes = require('./routes/eventRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB (skip in test environment to allow memory server)
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// ─── Middleware ─────────────────────────────────────────────────────────────

// Allowed origins: CLIENT_URL env var (production) + localhost for local dev
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// Security Headers
app.use(helmet());

// Rate Limiting (Basic global limit: 100 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Data Sanitization against NoSQL query injection
app.use(mongoSanitize());

// HTTP request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/stalls', stallRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin', adminRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  });
}

module.exports = app;
