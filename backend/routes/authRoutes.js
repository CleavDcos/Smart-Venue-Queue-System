/**
 * routes/authRoutes.js - Authentication Routes
 */

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { register, login, getMe, updateFcmToken } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 50 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  register
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

// GET /api/auth/me
router.get('/me', protect, getMe);

// PUT /api/auth/fcm-token
router.put('/fcm-token', protect, updateFcmToken);

module.exports = router;
