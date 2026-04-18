const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');
const Event = require('../models/Event');
const Stall = require('../models/Stall');
const User = require('../models/User');
const QueueToken = require('../models/QueueToken');

// Mock Firebase
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {}
}));

let authToken;
let eventId;
let stallId;

beforeAll(async () => {
  await dbHandler.connect();
  
  // 1. Create a dummy test user
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Queue Test User',
      email: 'queue@example.com',
      password: 'password123'
    });
  authToken = res.body.data.token;

  // 2. Create Event manually
  const event = await Event.create({
    name: 'Test Event',
    venue: 'Test Venue',
    date: new Date(),
    expectedCapacity: 1000,
    createdBy: res.body.data.user._id,
    status: 'active'
  });
  eventId = event._id.toString();

  // 3. Create Stall manually
  const stall = await Stall.create({
    name: 'Test Food Stall',
    category: 'food',
    location: 'North Stand',
    capacity: 10,
    isOpen: true,
    eventId: event._id
  });
  stallId = stall._id.toString();
});

afterEach(async () => {
  // Clear tokens but keep user, event, and stall
  await QueueToken.deleteMany({});
  await Stall.updateMany({}, { currentLoad: 0 });
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Queue APIs', () => {
  describe('POST /api/queue/join', () => {
    it('should join the queue successfully', async () => {
      const res = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          eventId,
          category: 'food'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.token).toHaveProperty('position');
      expect(res.body.data.token).toHaveProperty('estimatedWaitMinutes');
      expect(res.body.data.token.status).toEqual('waiting');
    });

    it('should not allow a user to join twice for the same event', async () => {
      // Join first time
      await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ eventId, category: 'food' });

      // Try to join again
      const res2 = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ eventId, category: 'food' });

      expect(res2.statusCode).toEqual(409);
      expect(res2.body.success).toEqual(false);
      expect(res2.body.message).toMatch(/already have an active token/i);
    });
    
    it('should fail if event ID is invalid', async () => {
      const res = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ eventId: 'invalid-id', category: 'food' });

      expect(res.statusCode).toEqual(400); // Invalid Event ID validator
    });
  });

  describe('GET /api/queue/my-token', () => {
    it('should return my active token with correct position and wait time', async () => {
      // Join queue
      const joinRes = await request(app)
        .post('/api/queue/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ eventId, category: 'food' });
        
      const createdTokenId = joinRes.body.data.token._id;

      // Get token
      const getRes = await request(app)
        .get('/api/queue/my-token')
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.statusCode).toEqual(200);
      expect(getRes.body.success).toEqual(true);
      expect(getRes.body.data.token._id).toEqual(createdTokenId);
      expect(getRes.body.data.token).toHaveProperty('position');
      expect(getRes.body.data.token).toHaveProperty('estimatedWaitMinutes');
      expect(getRes.body.data.token.stallId._id).toEqual(stallId);
    });

    it('should return 404 if user has no active token', async () => {
      const res = await request(app)
        .get('/api/queue/my-token')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toEqual(false);
    });
  });
});
