/**
 * services/queueEngine.js - AI Queue Orchestration Engine
 *
 * This is the core intelligence of the system. It implements heuristic algorithms for:
 *   1. Optimal stall assignment (load balancing)
 *   2. Wait time prediction
 *   3. Automatic queue rebalancing
 *
 * Algorithm Overview:
 * ─────────────────────────────────────────────────────────────────────────────
 * Assignment: Score-based selection
 *   score = (currentLoad / capacity) * 100 + (avgServiceTime * 10)
 *   → Lower score = better stall for new user
 *
 * Wait Time: Linear model
 *   estimatedWait = position × avgServiceTime
 *   (+10% buffer for variability)
 *
 * Rebalancing: Threshold-based redistribution
 *   - Overloaded: loadRatio > OVERLOAD_THRESHOLD (0.8)
 *   - Underloaded: loadRatio < UNDERLOAD_THRESHOLD (0.4)
 *   - Move the last N waiting users from overloaded → underloaded stalls
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Stall = require('../models/Stall');
const QueueToken = require('../models/QueueToken');
const { getFirestore } = require('../config/firebaseAdmin');
const { sendReassignmentNotification } = require('./notificationService');

// Rebalancing thresholds
const OVERLOAD_THRESHOLD = 0.8; // 80% capacity = overloaded
const UNDERLOAD_THRESHOLD = 0.4; // 40% capacity = underloaded
const REBALANCE_BATCH_SIZE = 3; // Max users to move per rebalance cycle

/**
 * Assign a user to the optimal available stall for a given category.
 *
 * @param {string} eventId - The event ID
 * @param {string} category - Queue category (food, beverage, etc.)
 * @returns {Object} { stall, position, estimatedWaitMinutes }
 */
const assignOptimalStall = async (eventId, category) => {
  // Fetch all open stalls for this event and category
  const stalls = await Stall.find({
    eventId,
    category,
    isOpen: true,
  });

  if (!stalls.length) {
    throw new Error(`No open stalls available for category: ${category}`);
  }

  /**
   * Score each stall — lower is better.
   * Formula: loadRatio (0-1) * 70 + avgServiceTime_weight * 30
   * This gives 70% weight to current load and 30% to inherent service speed.
   */
  const scoredStalls = stalls
    .map((stall) => {
      const loadRatio = stall.capacity > 0 ? stall.currentLoad / stall.capacity : 1;
      // Normalize service time (assume max realistic is 10 min)
      const serviceTimeWeight = Math.min(stall.avgServiceTime / 10, 1);
      const score = loadRatio * 70 + serviceTimeWeight * 30;
      return { stall, score, loadRatio };
    })
    .sort((a, b) => a.score - b.score); // Sort ascending → best first

  const best = scoredStalls[0];

  if (best.loadRatio >= 1) {
    // All stalls are at capacity — assign to least loaded anyway but warn
    console.warn(`⚠️  All stalls at capacity for category ${category}. Assigning to least loaded.`);
  }

  const selectedStall = best.stall;

  // Increment load on selected stall
  selectedStall.currentLoad += 1;
  await selectedStall.save();

  // Position in this stall's queue = new currentLoad
  const position = selectedStall.currentLoad;

  // Wait time = position × avgServiceTime × 1.1 buffer
  const estimatedWaitMinutes = Math.ceil(position * selectedStall.avgServiceTime * 1.1);

  return { stall: selectedStall, position, estimatedWaitMinutes };
};

/**
 * Calculate per-position wait time for a stall.
 * Used when recalculating after a user is served.
 *
 * @param {Object} stall - Stall document
 * @param {number} position - User's position in queue
 * @returns {number} Estimated wait in minutes
 */
const estimateWaitTime = (stall, position) => {
  return Math.ceil(position * stall.avgServiceTime * 1.1);
};

/**
 * Recalculate and update wait times for all waiting tokens at a stall.
 * Called whenever a token moves to 'serving' or 'done'.
 *
 * @param {string} stallId
 */
const recalculateQueuePositions = async (stallId) => {
  // Get all waiting tokens for this stall, sorted by join time
  const waitingTokens = await QueueToken.find({
    stallId,
    status: 'waiting',
  }).sort({ joinedAt: 1 }).lean();

  const stall = await Stall.findById(stallId);
  if (!stall) return;

  // Update positions sequentially
  for (let i = 0; i < waitingTokens.length; i++) {
    const token = waitingTokens[i];
    const newPosition = i + 1; // 1-indexed
    const newEstimatedWait = estimateWaitTime(stall, newPosition);

    await QueueToken.findByIdAndUpdate(token._id, {
      position: newPosition,
      estimatedWaitMinutes: newEstimatedWait,
    });

    // Sync to Firestore for real-time frontend updates (non-blocking, minimal data)
    syncTokenToFirestore(token._id.toString(), {
      position: newPosition,
      estimatedWaitMinutes: newEstimatedWait,
    }).catch(e => console.error("Firestore sync fail", e.message));
  }

  // Update stall's currentLoad to match actual waiting count
  stall.currentLoad = waitingTokens.length;
  await stall.save();

  // Sync stall load to Firestore (non-blocking)
  syncStallToFirestore(stallId.toString(), {
    currentLoad: stall.currentLoad,
  }).catch(e => console.error("Firestore sync fail", e.message));
};

/**
 * Rebalance queues across all stalls for an event.
 * Moves users from overloaded stalls to underloaded ones.
 *
 * @param {string} eventId
 * @returns {Object} Summary of changes made
 */
const rebalanceQueues = async (eventId) => {
  const stalls = await Stall.find({ eventId, isOpen: true });

  const overloaded = stalls.filter((s) => s.loadRatio > OVERLOAD_THRESHOLD);
  const underloaded = stalls.filter((s) => s.loadRatio < UNDERLOAD_THRESHOLD);

  if (!overloaded.length || !underloaded.length) {
    return { moved: 0, message: 'No rebalancing needed' };
  }

  let totalMoved = 0;
  const changes = [];

  for (const fromStall of overloaded) {
    if (!underloaded.length) break;

    // Get the last N waiting tokens from this stall (reassign from back of queue)
    const tokensToMove = await QueueToken.find({
      stallId: fromStall._id,
      status: 'waiting',
    })
      .sort({ joinedAt: -1 }) // Newest first (least impact on them)
      .limit(REBALANCE_BATCH_SIZE)
      .populate('userId');

    for (const token of tokensToMove) {
      // Find the best underloaded stall of the same category
      const targetStall = underloaded
        .filter((s) => s.category === fromStall.category && s._id.toString() !== fromStall._id.toString())
        .sort((a, b) => a.loadRatio - b.loadRatio)[0];

      if (!targetStall) continue;

      // Record reassignment history
      token.reassignmentHistory.push({
        fromStall: fromStall._id,
        toStall: targetStall._id,
        reason: 'Automatic load balancing',
        timestamp: new Date(),
      });

      // Move token to new stall
      const oldStallId = token.stallId;
      token.stallId = targetStall._id;
      token.status = 'reassigned'; // Briefly mark as reassigned

      // Recalculate position at new stall
      targetStall.currentLoad += 1;
      token.position = targetStall.currentLoad;
      token.estimatedWaitMinutes = estimateWaitTime(targetStall, token.position);
      token.status = 'waiting'; // Back to waiting at new stall

      await token.save();
      await targetStall.save();

      // Decrement old stall load
      fromStall.currentLoad = Math.max(0, fromStall.currentLoad - 1);
      await fromStall.save();

      // Push reassignment notification to user
      if (token.userId?.fcmToken) {
        await sendReassignmentNotification(
          token.userId.fcmToken,
          targetStall.name,
          targetStall.location,
          token.position,
          token.estimatedWaitMinutes
        );
      }

      // Sync to Firestore (non-blocking)
      syncTokenToFirestore(token._id.toString(), {
        stallId: targetStall._id.toString(),
        position: token.position,
        estimatedWaitMinutes: token.estimatedWaitMinutes,
        status: 'waiting',
      }).catch(e => console.error("Firestore sync fail", e.message));

      changes.push({
        tokenNumber: token.tokenNumber,
        from: fromStall.name,
        to: targetStall.name,
      });
      totalMoved++;

      // Recalculate old stall positions
      await recalculateQueuePositions(oldStallId.toString());
    }
  }

  return { moved: totalMoved, changes };
};

/**
 * Sync a token's data to Firestore for real-time frontend updates.
 * Falls back gracefully if Firestore is not configured.
 *
 * @param {string} tokenId
 * @param {Object} data - Partial data to merge
 */
const syncTokenToFirestore = async (tokenId, data) => {
  const db = getFirestore();
  if (!db) return; // Firebase not configured

  try {
    await db.collection('queueTokens').doc(tokenId).set(
      { ...data, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (error) {
    console.error('Firestore sync error (token):', error.message);
  }
};

/**
 * Sync a stall's load data to Firestore for real-time admin dashboard.
 *
 * @param {string} stallId
 * @param {Object} data - Partial data to merge
 */
const syncStallToFirestore = async (stallId, data) => {
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection('stalls').doc(stallId).set(
      { ...data, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (error) {
    console.error('Firestore sync error (stall):', error.message);
  }
};

module.exports = {
  assignOptimalStall,
  estimateWaitTime,
  recalculateQueuePositions,
  rebalanceQueues,
  syncTokenToFirestore,
  syncStallToFirestore,
};
