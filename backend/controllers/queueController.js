/**
 * controllers/queueController.js - Queue Management Controller
 *
 * Core business logic for:
 * - Joining virtual queue (generating tokens with QR codes)
 * - Viewing token status
 * - Completing service
 * - Admin: calling next user, manual reassignment
 */

const QRCode = require('qrcode');
const { validationResult } = require('express-validator');
const QueueToken = require('../models/QueueToken');
const User = require('../models/User');
const Event = require('../models/Event');
const {
  assignOptimalStall,
  recalculateQueuePositions,
  syncTokenToFirestore,
} = require('../services/queueEngine');
const {
  sendYouAreNextNotification,
  sendServiceCompleteNotification,
  sendTurnApproachingNotification,
} = require('../services/notificationService');

/**
 * @route   POST /api/queue/join
 * @desc    User joins the virtual queue for an event/category
 * @access  Private
 *
 * Body: { eventId, category, notes? }
 * Returns: QueueToken with QR code data URL
 */
const joinQueue = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { eventId, category, notes } = req.body;
  const userId = req.user.id;

  try {
    // Check event exists and is active
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (event.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Event is not active (status: ${event.status})`,
      });
    }

    // Check if user already has an active token for this event and category
    const existingToken = await QueueToken.findOne({
      userId,
      eventId,
      category,
      status: { $in: ['waiting', 'serving'] },
    });

    if (existingToken) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active token for this category',
        data: { token: existingToken },
      });
    }

    // Use queue engine to find and assign the best stall
    const { stall, position, estimatedWaitMinutes } = await assignOptimalStall(eventId, category);

    // Generate unique token number
    const tokenNumber = await QueueToken.generateTokenNumber(category);

    // Generate QR code containing the token number (for stall verification)
    const qrCodeDataUrl = await QRCode.toDataURL(
      JSON.stringify({
        tokenNumber,
        userId,
        eventId,
        stallId: stall._id.toString(),
        category,
      }),
      {
        width: 300,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }
    );

    // Create the queue token
    const token = await QueueToken.create({
      tokenNumber,
      qrCode: qrCodeDataUrl,
      userId,
      eventId,
      stallId: stall._id,
      position,
      estimatedWaitMinutes,
      category,
      notes: notes || '',
      status: 'waiting',
    });

    // Sync to Firestore for real-time updates (non-blocking, minimal data)
    syncTokenToFirestore(token._id.toString(), {
      eventId: eventId.toString(),
      tokenNumber: token.tokenNumber,
      stallId: stall._id.toString(),
      position,
      estimatedWaitMinutes,
      status: 'waiting',
    }).catch(e => console.error("Firestore sync fail", e.message));

    // Update user's current event
    await User.findByIdAndUpdate(userId, { currentEvent: eventId });

    // Notify user if wait is short (≤ 5 minutes)
    if (estimatedWaitMinutes <= 5) {
      const user = await User.findById(userId);
      if (user?.fcmToken) {
        await sendTurnApproachingNotification(user.fcmToken, estimatedWaitMinutes, stall.name);
      }
    }

    res.status(201).json({
      success: true,
      message: `Joined queue successfully! You are #${position} at ${stall.name}`,
      data: {
        token: {
          _id: token._id,
          tokenNumber: token.tokenNumber,
          qrCode: qrCodeDataUrl,
          position,
          estimatedWaitMinutes,
          status: 'waiting',
          stall: {
            name: stall.name,
            location: stall.location,
            navigationInstructions: stall.navigationInstructions,
            category: stall.category,
          },
        },
      },
    });
  } catch (error) {
    console.error('Join queue error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to join queue' });
  }
};

/**
 * @route   GET /api/queue/my-token
 * @desc    Get the current user's active token
 * @access  Private
 */
const getMyToken = async (req, res) => {
  try {
    const token = await QueueToken.findOne({
      userId: req.user.id,
      status: { $in: ['waiting', 'serving'] },
    })
      .populate('stallId', 'name location navigationInstructions category')
      .populate('eventId', 'name venue')
      .lean();

    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'No active queue token found',
      });
    }

    res.json({ success: true, data: { token } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/queue/history
 * @desc    Get user's queue token history
 * @access  Private
 */
const getMyHistory = async (req, res) => {
  try {
    const tokens = await QueueToken.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('stallId', 'name location category')
      .populate('eventId', 'name venue date')
      .lean();

    res.json({ success: true, data: { tokens } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   POST /api/queue/cancel
 * @desc    User cancels their active token
 * @access  Private
 */
const cancelToken = async (req, res) => {
  try {
    const token = await QueueToken.findOne({
      userId: req.user.id,
      status: 'waiting',
    });

    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'No cancellable token found (must be in waiting status)',
      });
    }

    const stallId = token.stallId.toString();
    token.status = 'cancelled';
    await token.save();

    // Recalculate queue positions for this stall
    await recalculateQueuePositions(stallId);

    // Update Firestore (non-blocking)
    syncTokenToFirestore(token._id.toString(), { status: 'cancelled' })
      .catch(e => console.error("Firestore sync fail", e.message));

    res.json({ success: true, message: 'Token cancelled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   POST /api/queue/call-next/:stallId
 * @desc    Admin calls the next person to a stall (marks serving)
 * @access  Admin
 */
const callNextUser = async (req, res) => {
  const { stallId } = req.params;

  try {
    // Find the first waiting token for this stall
    const nextToken = await QueueToken.findOne({
      stallId,
      status: 'waiting',
    })
      .sort({ joinedAt: 1 }) // Earliest first
      .populate('userId', 'fcmToken name');

    if (!nextToken) {
      return res.status(404).json({
        success: false,
        message: 'No waiting users in this queue',
      });
    }

    nextToken.status = 'serving';
    nextToken.calledAt = new Date();
    await nextToken.save();

    // Notify user
    if (nextToken.userId?.fcmToken) {
      const stall = await require('../models/Stall').findById(stallId);
      await sendYouAreNextNotification(
        nextToken.userId.fcmToken,
        stall?.name || 'your stall',
        stall?.location || ''
      );
    }

    // Update Firestore (non-blocking)
    syncTokenToFirestore(nextToken._id.toString(), {
      status: 'serving',
    }).catch(e => console.error("Firestore sync fail", e.message));

    // Recalculate remaining queue
    await recalculateQueuePositions(stallId);

    res.json({
      success: true,
      message: `Called ${nextToken.userId?.name || 'user'} to stall`,
      data: { token: nextToken },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   POST /api/queue/complete/:tokenId
 * @desc    Mark a token's service as complete
 * @access  Admin
 */
const completeService = async (req, res) => {
  const { tokenId } = req.params;

  try {
    const token = await QueueToken.findOne({ _id: tokenId, status: 'serving' }).populate(
      'userId',
      'fcmToken'
    );

    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'Token not found or not in serving status',
      });
    }

    const stallId = token.stallId.toString();
    token.status = 'done';
    token.completedAt = new Date();
    await token.save();

    // Update stall stats
    await require('../models/Stall').findByIdAndUpdate(stallId, {
      $inc: { totalServed: 1 },
    });

    // Send completion notification
    if (token.userId?.fcmToken) {
      const stall = await require('../models/Stall').findById(stallId);
      await sendServiceCompleteNotification(token.userId.fcmToken, stall?.name || 'stall');
    }

    // Update Firestore (non-blocking)
    syncTokenToFirestore(tokenId, {
      status: 'done',
    }).catch(e => console.error("Firestore sync fail", e.message));

    // Recalculate queue positions after service
    await recalculateQueuePositions(stallId);

    res.json({ success: true, message: 'Service marked complete' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/queue/stall/:stallId
 * @desc    Get all waiting/serving tokens for a specific stall
 * @access  Admin
 */
const getStallQueue = async (req, res) => {
  const { stallId } = req.params;

  try {
    const tokens = await QueueToken.find({
      stallId,
      status: { $in: ['waiting', 'serving'] },
    })
      .sort({ position: 1 })
      .populate('userId', 'name email')
      .lean();

    res.json({ success: true, data: { tokens } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  joinQueue,
  getMyToken,
  getMyHistory,
  cancelToken,
  callNextUser,
  completeService,
  getStallQueue,
};
