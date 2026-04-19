const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');
const Event = require('../models/Event');
const Stall = require('../models/Stall');
const QueueToken = require('../models/QueueToken');

// Mock Firebase
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {}
}));

let authToken1, authToken2;
let eventId;
let stall1Id, stall2Id;

beforeAll(async () => {
  await dbHandler.connect();
  
  // Register two users
  const res1 = await request(app).post('/api/auth/register').send({
    name: 'User One', email: 'user1@example.com', password: 'password123'
  });
  authToken1 = res1.body.data.token;

  const res2 = await request(app).post('/api/auth/register').send({
    name: 'User Two', email: 'user2@example.com', password: 'password123'
  });
  authToken2 = res2.body.data.token;

  // Create Event
  const event = await Event.create({
    name: 'E2E Event', venue: 'Main Arena', date: new Date(), expectedCapacity: 100, createdBy: res1.body.data.user._id, status: 'active'
  });
  eventId = event._id.toString();

  // Create two stalls to test routing.
  const stall1 = await Stall.create({
    name: 'Stall One', category: 'food', location: 'East', capacity: 10, isOpen: true, eventId: event._id, currentLoad: 5, avgServiceTime: 2
  });
  stall1Id = stall1._id.toString();

  const stall2 = await Stall.create({
    name: 'Stall Two', category: 'food', location: 'West', capacity: 10, isOpen: true, eventId: event._id, currentLoad: 1, avgServiceTime: 2
  });
  stall2Id = stall2._id.toString();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Integration Test: End-to-End Queue Assignment and Rebalancing', () => {
  it('should assign new user to the least loaded stall automatically', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${authToken1}`)
      .send({ eventId, category: 'food' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toEqual(true);
    // Because Stall 2 has load 1 and Stall 1 has load 5, user should be assigned to Stall 2
    expect(res.body.data.token.stall.name).toEqual('Stall Two');
    expect(res.body.data.token.position).toEqual(2); // load is now 2
    expect(res.body.data.token.estimatedWaitMinutes).toEqual(Math.ceil(2 * 2 * 1.1));
  });

  it('should correctly move queue forward when an admin calls the next user', async () => {
    // Note: User 2 joins on stall 2 as well, so position becomes 3
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${authToken2}`)
      .send({ eventId, category: 'food' });

    // Mock admin login
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Admin', email: 'admin@e2e.com', password: 'password123', role: 'admin'
    });
    // Manually force admin role in DB
    await require('../models/User').updateOne({ email: 'admin@e2e.com' }, { role: 'admin' });
    const authAdminResponse = await request(app).post('/api/auth/login').send({ email: 'admin@e2e.com', password: 'password123' });
    const adminToken = authAdminResponse.body.data.token;

    // Admin calls next user on stall 2
    const callRes = await request(app)
      .post(`/api/queue/call-next/${stall2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(callRes.statusCode).toEqual(200);
    expect(callRes.body.data.token.status).toEqual('serving'); // Should be User 1's token
  });
});
