/**
 * models/Event.js - Sporting Event Schema
 * Represents a single sporting event at the venue (e.g., IPL Match, Football Final).
 */

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Event name is required'],
      trim: true,
    },
    venue: {
      type: String,
      required: [true, 'Venue is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    // Expected audience capacity
    expectedCapacity: {
      type: Number,
      required: true,
      min: [1, 'Capacity must be at least 1'],
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'closed'],
      default: 'upcoming',
    },
    // QR code entry point URL (pointing to this event's join page)
    qrCodeUrl: {
      type: String,
      default: null,
    },
    // Admin who created this event
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    // Virtual for stalls count
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: Get all stalls for this event
eventSchema.virtual('stalls', {
  ref: 'Stall',
  localField: '_id',
  foreignField: 'eventId',
});

// Virtual: Count active queue tokens
eventSchema.virtual('activeQueueCount', {
  ref: 'QueueToken',
  localField: '_id',
  foreignField: 'eventId',
  count: true,
  match: { status: { $in: ['waiting', 'serving'] } },
});

module.exports = mongoose.model('Event', eventSchema);
