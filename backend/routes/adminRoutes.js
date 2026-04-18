/**
 * routes/adminRoutes.js - Admin Dashboard & Management Routes
 */

const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getAnalytics,
  triggerRebalance,
  sendBroadcast,
  getUsers,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

// GET /api/admin/dashboard/:eventId
router.get('/dashboard/:eventId', getDashboardStats);

// GET /api/admin/analytics/:eventId
router.get('/analytics/:eventId', getAnalytics);

// POST /api/admin/rebalance/:eventId
router.post('/rebalance/:eventId', triggerRebalance);

// POST /api/admin/broadcast/:eventId
router.post('/broadcast/:eventId', sendBroadcast);

// GET /api/admin/users
router.get('/users', getUsers);

module.exports = router;
