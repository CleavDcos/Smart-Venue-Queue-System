/**
 * models/Stall.js - Service Stall Schema
 * Represents a food/drink/merch stall inside the venue.
 * Tracks real-time queue load and average service performance.
 */

const mongoose = require('mongoose');

const stallSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Stall name is required'],
      trim: true,
    },
    // Category determines which stalls a user can be assigned to
    category: {
      type: String,
      enum: ['food', 'beverage', 'merchandise', 'medical', 'information'],
      required: [true, 'Category is required'],
    },
    // Physical location descriptor (e.g., "North Stand, Gate 3")
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    // Navigation instructions for the user
    navigationInstructions: {
      type: String,
      default: 'Follow signs to your assigned stall.',
    },
    // Maximum number of people this stall can serve simultaneously
    capacity: {
      type: Number,
      required: true,
      min: [1, 'Capacity must be at least 1'],
      default: 20,
    },
    // Current number of people in the queue for this stall
    currentLoad: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Average time (in minutes) to serve one customer
    avgServiceTime: {
      type: Number,
      default: 3, // minutes
      min: 0.5,
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    // The event this stall belongs to
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    // Running stats for analytics
    totalServed: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Optimize find stalls by event, category, and open status
stallSchema.index({ eventId: 1, category: 1, isOpen: 1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
/**
 * Load ratio: 0 (empty) to 1+ (overloaded)
 * Used by queueEngine to determine optimal assignment
 */
stallSchema.virtual('loadRatio').get(function () {
  return this.capacity > 0 ? this.currentLoad / this.capacity : 1;
});

/**
 * Estimated wait time for the next person joining this stall
 */
stallSchema.virtual('estimatedWaitMinutes').get(function () {
  return Math.ceil(this.currentLoad * this.avgServiceTime);
});

stallSchema.set('toJSON', { virtuals: true });
stallSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Stall', stallSchema);
