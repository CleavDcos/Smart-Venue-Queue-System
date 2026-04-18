const dbHandler = require('./setup');
const Event = require('../models/Event');
const Stall = require('../models/Stall');
const { assignOptimalStall, estimateWaitTime } = require('../services/queueEngine');

// Mock external services to avoid errors
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {}
}));
jest.mock('../services/notificationService', () => ({
  sendReassignmentNotification: jest.fn()
}));

let eventId;

beforeAll(async () => {
  await dbHandler.connect();
  
  const event = await Event.create({
    name: 'Engine Test Event',
    venue: 'Engine Venue',
    date: new Date(),
    expectedCapacity: 1000,
    createdBy: '000000000000000000000000', // Dummy Object ID
    status: 'active'
  });
  eventId = event._id;
});

afterEach(async () => {
  await Stall.deleteMany({});
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Queue Engine Unit Tests', () => {
  describe('estimateWaitTime', () => {
    it('should correctly calculate wait time based on position and stall stats', () => {
      const stall = { avgServiceTime: 3 }; // 3 minutes per user
      const position = 5;
      
      // wait = position * avgServiceTime * 1.1 buffer
      // wait = 5 * 3 * 1.1 = 16.5 -> rounded up = 17
      const waitTime = estimateWaitTime(stall, position);
      expect(waitTime).toEqual(17);
    });
  });

  describe('assignOptimalStall', () => {
    it('should throw an error if no open stalls are available', async () => {
      await expect(assignOptimalStall(eventId, 'food')).rejects.toThrow(/No open stalls available/);
    });

    it('should correctly assign user to the least loaded stall', async () => {
      // Create two stalls, one heavily loaded, one empty
      await Stall.create({
        name: 'Stall 1',
        category: 'food',
        location: 'North',
        capacity: 10,
        currentLoad: 8,
        avgServiceTime: 2,
        isOpen: true,
        eventId
      });

      await Stall.create({
        name: 'Stall 2',
        category: 'food',
        location: 'South',
        capacity: 10,
        currentLoad: 1, // <--- User should be assigned here
        avgServiceTime: 2,
        isOpen: true,
        eventId
      });

      const assignment = await assignOptimalStall(eventId, 'food');
      
      expect(assignment.stall.name).toEqual('Stall 2');
      expect(assignment.position).toEqual(2); // Since it was load 1, now load 2
    });

    it('should account for service time differences during assignment', async () => {
      // Stall 1: Very small load but painfully slow
      await Stall.create({
        name: 'Stall 1 Slow',
        category: 'beverage',
        location: 'East',
        capacity: 10,
        currentLoad: 2,
        avgServiceTime: 10, // Max wait penalty
        isOpen: true,
        eventId
      });

      // Stall 2: Medium load but super fast
      await Stall.create({
        name: 'Stall 2 Fast',
        category: 'beverage',
        location: 'West',
        capacity: 10,
        currentLoad: 4,
        avgServiceTime: 1, // Quick turnaround
        isOpen: true,
        eventId
      });

      const assignment = await assignOptimalStall(eventId, 'beverage');
      
      // Stall 2 should have a lower score despite higher base load, due to much better service time.
      // Expected formula: loadRatio * 70 + serviceTimeWeight * 30
      // S1: (2/10)*70 + (10/10)*30 = 14 + 30 = 44
      // S2: (4/10)*70 + (1/10)*30 = 28 + 3 = 31
      expect(assignment.stall.name).toEqual('Stall 2 Fast');
    });
  });
});
