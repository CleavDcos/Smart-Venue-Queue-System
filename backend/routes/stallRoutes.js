/**
 * routes/stallRoutes.js - Stall Management Routes
 */

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  createStall,
  getEventStalls,
  getStall,
  updateStall,
  toggleStall,
  deleteStall,
} = require('../controllers/stallController');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/stalls/event/:eventId - Public stall listing
router.get('/event/:eventId', getEventStalls);

// GET /api/stalls/:id - Single stall
router.get('/:id', getStall);

// POST /api/stalls - Create stall (Admin)
router.post(
  '/',
  protect,
  adminOnly,
  [
    body('name').trim().notEmpty().withMessage('Stall name is required'),
    body('category')
      .isIn(['food', 'beverage', 'merchandise', 'medical', 'information'])
      .withMessage('Invalid category'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
    body('avgServiceTime').isFloat({ min: 0.5 }).withMessage('Service time must be at least 0.5 min'),
    body('eventId').isMongoId().withMessage('Valid event ID is required'),
  ],
  createStall
);

// PUT /api/stalls/:id - Update stall (Admin)
router.put('/:id', protect, adminOnly, updateStall);

// PUT /api/stalls/:id/toggle - Toggle open/close (Admin)
router.put('/:id/toggle', protect, adminOnly, toggleStall);

// DELETE /api/stalls/:id - Delete stall (Admin)
router.delete('/:id', protect, adminOnly, deleteStall);

module.exports = router;
