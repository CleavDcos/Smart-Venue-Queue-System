const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');
const Event = require('../models/Event');
const Stall = require('../models/Stall');
const User = require('../models/User');
const QueueToken = require('../models/QueueToken');

jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {}
}));

let adminToken;
let userToken;
let eventId;
let stallId;

beforeAll(async () => {
  await dbHandler.connect();
  
  // Create admin user
  const adminRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123'
    });
  adminToken = adminRes.body.data.token;
  
  // Make the user an admin
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  // Create normal user
  const userRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Normal User',
      email: 'user@example.com',
      password: 'password123'
    });
  userToken = userRes.body.data.token;
  const userId = userRes.body.data.user._id;

  // Create Event and Stall
  const event = await Event.create({
    name: 'Admin Test Event',
    venue: 'Test Venue',
    date: new Date(),
    expectedCapacity: 1000,
    createdBy: adminRes.body.data.user._id,
    status: 'active'
  });
  eventId = event._id.toString();

  const stall = await Stall.create({
    name: 'Admin Test Stall',
    category: 'food',
    location: 'South Stand',
    capacity: 10,
    isOpen: true,
    eventId: event._id
  });
  stallId = stall._id.toString();
});

afterEach(async () => {
  await QueueToken.deleteMany({});
  await Stall.updateMany({}, { currentLoad: 0 });
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Admin Action APIs', () => {
  describe('Authorization Checks', () => {
    it('should deny unauthorized access to admin endpoint', async () => {
      // Use normal user token
      const res = await request(app)
        .post(`/api/queue/call-next/${stallId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toEqual(false);
      expect(res.body.message).toMatch(/Admin privileges required/i);
    });
  });

  describe('Queue Manipulations', () => {
    it('should handle calling next when queue is empty', async () => {
      const res = await request(app)
        .post(`/api/queue/call-next/${stallId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toEqual(false);
      expect(res.body.message).toMatch(/no waiting users/i);
    });

    it('should call next user and move queue forward', async () => {
      // Have user join the queue
      const joinRes = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ eventId, category: 'food' });
        
      const tokenId = joinRes.body.data.token._id;

      let stall = await Stall.findById(stallId);
      expect(stall.currentLoad).toEqual(1);

      // Call next user
      const callRes = await request(app)
        .post(`/api/queue/call-next/${stallId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(callRes.statusCode).toEqual(200);
      expect(callRes.body.success).toEqual(true);
      expect(callRes.body.data.token._id).toEqual(tokenId);
      expect(callRes.body.data.token.status).toEqual('serving');
      
      stall = await Stall.findById(stallId);
      expect(stall.currentLoad).toEqual(0); // Serving users aren't holding up the "waiting" line the same way, or the engine modifies it.
    });

    it('should complete a token service', async () => {
      // User joins
      const joinRes = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ eventId, category: 'food' });
      const tokenId = joinRes.body.data.token._id;
      
      // Admin calls next
      await request(app)
        .post(`/api/queue/call-next/${stallId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin completes the service
      const compRes = await request(app)
        .post(`/api/queue/complete/${tokenId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(compRes.statusCode).toEqual(200);
      expect(compRes.body.success).toEqual(true);
      
      const token = await QueueToken.findById(tokenId);
      expect(token.status).toEqual('done');
    });
  });
});
