/**
 * routes/eventRoutes.js - Event Management Routes
 */

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEvent,
  updateEventStatus,
  deleteEvent,
} = require('../controllers/eventController');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/events - List events (public)
router.get('/', getEvents);

// GET /api/events/:id - Get single event (public)
router.get('/:id', getEvent);

// POST /api/events - Create event (Admin)
router.post(
  '/',
  protect,
  adminOnly,
  [
    body('name').trim().notEmpty().withMessage('Event name is required'),
    body('venue').trim().notEmpty().withMessage('Venue is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('expectedCapacity').isInt({ min: 1 }).withMessage('Capacity must be positive'),
  ],
  createEvent
);

// PUT /api/events/:id/status - Change status (Admin)
router.put('/:id/status', protect, adminOnly, updateEventStatus);

// DELETE /api/events/:id - Delete event (Admin)
router.delete('/:id', protect, adminOnly, deleteEvent);

module.exports = router;
