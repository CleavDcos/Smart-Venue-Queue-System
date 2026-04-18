/**
 * routes/queueRoutes.js - Virtual Queue Routes
 */

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const {
  joinQueue,
  getMyToken,
  getMyHistory,
  cancelToken,
  callNextUser,
  completeService,
  getStallQueue,
} = require('../controllers/queueController');
const { protect, adminOnly } = require('../middleware/auth');

// ─── User Routes ────────────────────────────────────────────────────────────

// POST /api/queue/join - Join the virtual queue
router.post(
  '/join',
  protect,
  [
    body('eventId').isMongoId().withMessage('Valid event ID is required'),
    body('category')
      .isIn(['food', 'beverage', 'merchandise', 'medical', 'information'])
      .withMessage('Invalid category'),
    body('notes').optional().isString().isLength({ max: 200 }),
  ],
  joinQueue
);

// GET /api/queue/my-token - Get my active token
router.get('/my-token', protect, getMyToken);

// GET /api/queue/history - Get token history
router.get('/history', protect, getMyHistory);

// POST /api/queue/cancel - Cancel active token
router.post('/cancel', protect, cancelToken);

// ─── Admin Routes ────────────────────────────────────────────────────────────

// POST /api/queue/call-next/:stallId - Call next user
router.post('/call-next/:stallId', protect, adminOnly, callNextUser);

// POST /api/queue/complete/:tokenId - Mark service complete
router.post('/complete/:tokenId', protect, adminOnly, completeService);

// GET /api/queue/stall/:stallId - Get stall queue
router.get('/stall/:stallId', protect, adminOnly, getStallQueue);

module.exports = router;
