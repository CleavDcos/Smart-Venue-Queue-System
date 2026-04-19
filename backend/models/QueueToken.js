/**
 * models/QueueToken.js - Virtual Queue Token Schema
 * Core entity of the system. Each token represents a user's place in a queue.
 *
 * Lifecycle: waiting → serving → done
 *            waiting → reassigned (moved to a different stall)
 *            waiting → cancelled
 */

const mongoose = require('mongoose');

const queueTokenSchema = new mongoose.Schema(
  {
    // Auto-generated human-readable token number (e.g., FOOD-042)
    tokenNumber: {
      type: String,
      required: true,
      unique: true,
    },
    // QR code data URL (base64 PNG) — scanned at stall entry
    qrCode: {
      type: String,
      default: null,
    },
    // Foreign key references
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    stallId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stall',
      required: true,
    },
    // Position in the stall's queue (1 = next to be served)
    position: {
      type: Number,
      required: true,
      min: 1,
    },
    // Estimated minutes until served (recalculated on each queue update)
    estimatedWaitMinutes: {
      type: Number,
      default: 0,
    },
    // Token lifecycle status
    status: {
      type: String,
      enum: ['waiting', 'serving', 'done', 'reassigned', 'cancelled'],
      default: 'waiting',
    },
    // Timestamps for queue analytics
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    calledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Track reassignment history for analytics
    reassignmentHistory: [
      {
        fromStall: { type: mongoose.Schema.Types.ObjectId, ref: 'Stall' },
        toStall: { type: mongoose.Schema.Types.ObjectId, ref: 'Stall' },
        reason: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Category the user requested (determines eligible stalls)
    category: {
      type: String,
      enum: ['food', 'beverage', 'merchandise', 'medical', 'information'],
      required: true,
    },
    // User preference note (e.g., "vegetarian only")
    notes: {
      type: String,
      default: '',
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimise common lookups
queueTokenSchema.index({ userId: 1, status: 1 });
queueTokenSchema.index({ stallId: 1, status: 1, joinedAt: 1 });
queueTokenSchema.index({ eventId: 1, status: 1, category: 1 });

// ─── Static Methods ───────────────────────────────────────────────────────────
/**
 * Generate a unique token number in format: CAT-NNN (e.g., FOOD-042)
 */
queueTokenSchema.statics.generateTokenNumber = async function (category) {
  const prefix = category.substring(0, 4).toUpperCase();
  const count = await this.countDocuments({ category });
  const number = String(count + 1).padStart(3, '0');
  return `${prefix}-${number}`;
};

module.exports = mongoose.model('QueueToken', queueTokenSchema);
