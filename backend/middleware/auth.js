/**
 * middleware/auth.js - JWT Authentication & Role-Based Authorization
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect - Verify JWT token and attach user to request.
 * Apply to any route that requires authentication.
 */
const protect = async (req, res, next) => {
  let token;

  // Extract token from Authorization header: "Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  try {
    // Verify token and decode payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (without password)
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account disabled.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired, please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * adminOnly - Restrict route to admins only.
 * Must be used after `protect` middleware.
 */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.',
    });
  }
  next();
};

/**
 * optionalAuth - Attach user to request if token is present, but don't reject if missing.
 * Useful for routes that behave differently for authenticated vs anonymous users.
 */
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
  } catch {
    // Ignore errors — user simply isn't authenticated
  }
  next();
};

module.exports = { protect, adminOnly, optionalAuth };
