/**
 * controllers/eventController.js - Event Management Controller
 */

const QRCode = require('qrcode');
const { validationResult } = require('express-validator');
const Event = require('../models/Event');

/**
 * @route   POST /api/events
 * @desc    Create a new event
 * @access  Admin
 */
const createEvent = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, venue, description, date, expectedCapacity } = req.body;

  try {
    const event = await Event.create({
      name,
      venue,
      description,
      date,
      expectedCapacity,
      createdBy: req.user.id,
    });

    // Generate QR code URL pointing to event join page
    const joinUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/join/${event._id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, { width: 400, margin: 2 });
    event.qrCodeUrl = qrCodeDataUrl;
    await event.save();

    res.status(201).json({ success: true, data: { event } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/events
 * @desc    Get all events (with optional status filter)
 * @access  Public
 */
const getEvents = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const events = await Event.find(filter)
      .sort({ date: -1 })
      .populate('createdBy', 'name');

    res.json({ success: true, data: { events } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/events/:id
 * @desc    Get a single event with stall summary
 * @access  Public
 */
const getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('createdBy', 'name');
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: { event } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   PUT /api/events/:id/status
 * @desc    Change event status (upcoming → active → closed)
 * @access  Admin
 */
const updateEventStatus = async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['upcoming', 'active', 'closed'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: { event } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete an event
 * @access  Admin
 */
const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createEvent, getEvents, getEvent, updateEventStatus, deleteEvent };
