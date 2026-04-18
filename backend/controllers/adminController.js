/**
 * controllers/adminController.js - Admin Dashboard Controller
 *
 * Provides analytics and management endpoints for the admin dashboard:
 * - Live queue load per stall
 * - Wait time analytics
 * - Throughput stats
 * - Manual rebalance trigger
 */

const mongoose = require('mongoose');
const Stall = require('../models/Stall');
const QueueToken = require('../models/QueueToken');
const Event = require('../models/Event');
const User = require('../models/User');
const { rebalanceQueues } = require('../services/queueEngine');
const { sendBroadcastNotification } = require('../services/notificationService');

/**
 * @route   GET /api/admin/dashboard/:eventId
 * @desc    Get live dashboard stats for an event
 * @access  Admin
 */
const getDashboardStats = async (req, res) => {
  const { eventId } = req.params;

  try {
    const [event, stalls, tokenStats] = await Promise.all([
      Event.findById(eventId),
      Stall.find({ eventId }),
      QueueToken.aggregate([
        { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Format token stats into a readable object
    const tokenSummary = { waiting: 0, serving: 0, done: 0, cancelled: 0, reassigned: 0 };
    tokenStats.forEach((s) => {
      tokenSummary[s._id] = s.count;
    });

    // Build per-stall heatmap data
    const stallData = stalls.map((stall) => ({
      _id: stall._id,
      name: stall.name,
      category: stall.category,
      location: stall.location,
      capacity: stall.capacity,
      currentLoad: stall.currentLoad,
      loadRatio: stall.loadRatio,
      estimatedWaitMinutes: stall.estimatedWaitMinutes,
      totalServed: stall.totalServed,
      isOpen: stall.isOpen,
      // Heat level for frontend heatmap: 0 = cool, 1 = hot
      heatLevel: Math.min(stall.loadRatio, 1),
    }));

    // Overall stats
    const totalInQueue = tokenSummary.waiting + tokenSummary.serving;
    const avgWaitAcrossStalls =
      stalls.length > 0
        ? stalls.reduce((sum, s) => sum + s.estimatedWaitMinutes, 0) / stalls.length
        : 0;

    res.json({
      success: true,
      data: {
        event: { name: event.name, venue: event.venue, status: event.status },
        overview: {
          totalInQueue,
          totalServed: tokenSummary.done,
          totalCancelled: tokenSummary.cancelled,
          avgWaitMinutes: Math.round(avgWaitAcrossStalls),
          openStalls: stalls.filter((s) => s.isOpen).length,
          totalStalls: stalls.length,
        },
        tokenSummary,
        stalls: stallData,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/admin/analytics/:eventId
 * @desc    Get historical analytics (queue timeline, throughput)
 * @access  Admin
 */
const getAnalytics = async (req, res) => {
  const { eventId } = req.params;

  try {
    // Average service time per stall
    const stallMetrics = await QueueToken.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          status: 'done',
          completedAt: { $ne: null },
          calledAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$stallId',
          avgActualServiceMinutes: {
            $avg: {
              $divide: [{ $subtract: ['$completedAt', '$calledAt'] }, 60000],
            },
          },
          totalServed: { $sum: 1 },
        },
      },
    ]);

    // Hourly throughput
    const hourlyThroughput = await QueueToken.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          status: 'done',
        },
      },
      {
        $group: {
          _id: { $hour: '$completedAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Category breakdown
    const categoryBreakdown = await QueueToken.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          waiting: { $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] } },
          done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        },
      },
    ]);

    res.json({
      success: true,
      data: { stallMetrics, hourlyThroughput, categoryBreakdown },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   POST /api/admin/rebalance/:eventId
 * @desc    Trigger queue rebalancing for an event
 * @access  Admin
 */
const triggerRebalance = async (req, res) => {
  const { eventId } = req.params;

  try {
    const result = await rebalanceQueues(eventId);

    res.json({
      success: true,
      message: `Rebalancing complete. Moved ${result.moved} user(s).`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   POST /api/admin/broadcast/:eventId
 * @desc    Send broadcast notification to all users at an event
 * @access  Admin
 */
const sendBroadcast = async (req, res) => {
  const { eventId } = req.params;
  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Title and message are required' });
  }

  try {
    // Get all users with active tokens for this event
    const activeTokens = await QueueToken.find({
      eventId,
      status: { $in: ['waiting', 'serving'] },
    }).populate('userId', 'fcmToken');

    const fcmTokens = activeTokens
      .map((t) => t.userId?.fcmToken)
      .filter(Boolean);

    const result = await sendBroadcastNotification(fcmTokens, title, message);

    res.json({
      success: true,
      message: `Broadcast sent to ${fcmTokens.length} user(s)`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/admin/users
 * @desc    Get all registered users (paginated)
 * @access  Admin
 */
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        users: users.map((u) => u.toPublicJSON()),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getDashboardStats, getAnalytics, triggerRebalance, sendBroadcast, getUsers };
