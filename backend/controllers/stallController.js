/**
 * controllers/stallController.js - Stall Management Controller
 */

const { validationResult } = require('express-validator');
const Stall = require('../models/Stall');
const { syncStallToFirestore } = require('../services/queueEngine');

/**
 * @route   POST /api/stalls
 * @desc    Create a new stall for an event
 * @access  Admin
 */
const createStall = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, category, location, navigationInstructions, capacity, avgServiceTime, eventId } = req.body;

  try {
    const stall = await Stall.create({
      name,
      category,
      location,
      navigationInstructions,
      capacity,
      avgServiceTime,
      eventId,
    });

    // Sync initial state to Firestore
    await syncStallToFirestore(stall._id.toString(), {
      stallId: stall._id.toString(),
      name: stall.name,
      category: stall.category,
      location: stall.location,
      capacity: stall.capacity,
      currentLoad: 0,
      isOpen: true,
      eventId: eventId.toString(),
    });

    res.status(201).json({ success: true, data: { stall } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/stalls/event/:eventId
 * @desc    Get all stalls for an event
 * @access  Public
 */
const getEventStalls = async (req, res) => {
  try {
    const stalls = await Stall.find({ eventId: req.params.eventId }).sort({ category: 1, name: 1 });
    res.json({ success: true, data: { stalls } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   GET /api/stalls/:id
 * @desc    Get a single stall
 * @access  Public
 */
const getStall = async (req, res) => {
  try {
    const stall = await Stall.findById(req.params.id);
    if (!stall) return res.status(404).json({ success: false, message: 'Stall not found' });
    res.json({ success: true, data: { stall } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   PUT /api/stalls/:id
 * @desc    Update stall details
 * @access  Admin
 */
const updateStall = async (req, res) => {
  try {
    const stall = await Stall.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!stall) return res.status(404).json({ success: false, message: 'Stall not found' });

    // Sync updated state to Firestore
    await syncStallToFirestore(stall._id.toString(), {
      isOpen: stall.isOpen,
      capacity: stall.capacity,
      avgServiceTime: stall.avgServiceTime,
    });

    res.json({ success: true, data: { stall } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   PUT /api/stalls/:id/toggle
 * @desc    Open or close a stall
 * @access  Admin
 */
const toggleStall = async (req, res) => {
  try {
    const stall = await Stall.findById(req.params.id);
    if (!stall) return res.status(404).json({ success: false, message: 'Stall not found' });

    stall.isOpen = !stall.isOpen;
    await stall.save();

    await syncStallToFirestore(stall._id.toString(), { isOpen: stall.isOpen });

    res.json({
      success: true,
      message: `Stall ${stall.isOpen ? 'opened' : 'closed'}`,
      data: { stall },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @route   DELETE /api/stalls/:id
 * @desc    Delete a stall
 * @access  Admin
 */
const deleteStall = async (req, res) => {
  try {
    const stall = await Stall.findByIdAndDelete(req.params.id);
    if (!stall) return res.status(404).json({ success: false, message: 'Stall not found' });
    res.json({ success: true, message: 'Stall deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createStall, getEventStalls, getStall, updateStall, toggleStall, deleteStall };
