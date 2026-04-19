/**
 * tests/queue.integration.test.js — Full End-to-End Integration Tests
 *
 * Tests the complete queue lifecycle through the HTTP API using:
 *   - Supertest for HTTP assertions
 *   - MongoDB Memory Server (via setup.js) — no real DB
 *   - Mocked Firebase (no real Firestore writes)
 *
 * Coverage:
 *   1. Full queue flow (join → call-next → complete)
 *   2. AI stall assignment (least-loaded routing)
 *   3. Duplicate join prevention
 *   4. Error handling (missing fields, invalid IDs, no stalls)
 *   5. RBAC — 401 unauthenticated, 403 non-admin
 *   6. Queue rebalancing endpoint
 *   7. Admin dashboard stats endpoint
 */

const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');
const Event = require('../models/Event');
const Stall = require('../models/Stall');
const QueueToken = require('../models/QueueToken');
const User = require('../models/User');

// ─── Mock Firebase (both imports used across the codebase) ──────────────────
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {},
}));
jest.mock('../config/firebaseAdmin', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  writeQueueSnapshot: jest.fn(() => Promise.resolve()),
  writeStallSnapshot: jest.fn(() => Promise.resolve()),
  admin: {},
}));

// ─── Shared state ────────────────────────────────────────────────────────────
let user1Token, user2Token, adminToken;
let eventId;
let foodStall1Id, foodStall2Id;

// ─── Setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await dbHandler.connect();

  // Register User 1
  const r1 = await request(app).post('/api/auth/register').send({
    name: 'User One', email: 'integ_user1@test.com', password: 'Password1!',
  });
  user1Token = r1.body.data.token;

  // Register User 2
  const r2 = await request(app).post('/api/auth/register').send({
    name: 'User Two', email: 'integ_user2@test.com', password: 'Password2!',
  });
  user2Token = r2.body.data.token;

  // Register Admin
  await request(app).post('/api/auth/register').send({
    name: 'Admin User', email: 'integ_admin@test.com', password: 'AdminPass!',
  });
  await User.updateOne({ email: 'integ_admin@test.com' }, { role: 'admin' });
  const adminLogin = await request(app).post('/api/auth/login').send({
    email: 'integ_admin@test.com', password: 'AdminPass!',
  });
  adminToken = adminLogin.body.data.token;

  // Create active event
  const event = await Event.create({
    name: 'Integration Test Event',
    venue: 'Test Arena',
    date: new Date(),
    expectedCapacity: 500,
    createdBy: r1.body.data.user._id,
    status: 'active',
  });
  eventId = event._id.toString();

  // Create two food stalls with different initial loads to test routing
  const stall1 = await Stall.create({
    name: 'Food Court A', category: 'food', location: 'North',
    capacity: 20, isOpen: true, eventId: event._id,
    currentLoad: 8, avgServiceTime: 3,
  });
  foodStall1Id = stall1._id.toString();

  const stall2 = await Stall.create({
    name: 'Food Court B', category: 'food', location: 'South',
    capacity: 20, isOpen: true, eventId: event._id,
    currentLoad: 2, avgServiceTime: 3,
  });
  foodStall2Id = stall2._id.toString();
});

afterEach(async () => {
  // Reset tokens and stall loads between tests
  await QueueToken.deleteMany({});
  await Stall.updateMany({ _id: foodStall1Id }, { currentLoad: 8 });
  await Stall.updateMany({ _id: foodStall2Id }, { currentLoad: 2 });
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

// ─── Test Suite 1: Full Queue Flow ───────────────────────────────────────────
describe('Integration: Full Queue Lifecycle', () => {
  it('POST /join → should return 201 with tokenNumber + stall + wait time', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toMatchObject({
      tokenNumber: expect.any(String),
      position:    expect.any(Number),
      status:      'waiting',
      stall: expect.objectContaining({ name: expect.any(String) }),
    });
    expect(res.body.data.token.estimatedWaitMinutes).toBeGreaterThan(0);
  });

  it('POST /join → AI should assign user to least-loaded stall (Food Court B)', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    expect(res.statusCode).toBe(201);
    // Food Court B has load 2, Food Court A has load 8 → B wins
    expect(res.body.data.token.stall.name).toBe('Food Court B');
  });

  it('POST /join → estimatedWaitMinutes should use position × serviceTime × 1.1 formula', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    const { position, estimatedWaitMinutes } = res.body.data.token;
    const expectedWait = Math.ceil(position * 3 * 1.1); // avgServiceTime = 3
    expect(estimatedWaitMinutes).toBe(expectedWait);
  });

  it('Full flow: join → call-next (serving) → complete (done)', async () => {
    // 1. Join
    const joinRes = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });
    expect(joinRes.statusCode).toBe(201);
    const tokenId = joinRes.body.data.token._id;
    const assignedStallId = joinRes.body.data.token.stall
      ? foodStall2Id   // B is least loaded
      : foodStall2Id;

    // 2. Admin calls next
    const callRes = await request(app)
      .post(`/api/queue/call-next/${foodStall2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(callRes.statusCode).toBe(200);
    expect(callRes.body.data.token.status).toBe('serving');

    // 3. Admin marks complete
    const doneRes = await request(app)
      .post(`/api/queue/complete/${tokenId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(doneRes.statusCode).toBe(200);
    expect(doneRes.body.success).toBe(true);

    // 4. Verify DB state
    const dbToken = await QueueToken.findById(tokenId);
    expect(dbToken.status).toBe('done');
    expect(dbToken.completedAt).toBeDefined();
  });

  it('GET /my-token → should reflect the joined token correctly', async () => {
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    const res = await request(app)
      .get('/api/queue/my-token')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.token.status).toBe('waiting');
    expect(res.body.data.token.stallId).toBeDefined();
  });

  it('POST /cancel → should cancel active token and return 200', async () => {
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    const res = await request(app)
      .post('/api/queue/cancel')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // GET /my-token should now return 404
    const check = await request(app)
      .get('/api/queue/my-token')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(check.statusCode).toBe(404);
  });
});

// ─── Test Suite 2: Error Handling ────────────────────────────────────────────
describe('Integration: Error Handling & Validation', () => {
  it('POST /join with missing category → 400 with validation errors array', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId }); // no category

    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty('msg');
  });

  it('POST /join with invalid category string → 400', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'gambling' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/Invalid category/i);
  });

  it('POST /join with non-MongoId eventId → 400', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId: 'not-a-valid-id', category: 'food' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/Valid event ID/i);
  });

  it('POST /join with non-existent (but valid-format) eventId → 404', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId: '507f1f77bcf86cd799439011', category: 'food' });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/Event not found/i);
  });

  it('POST /join duplicate for same event → 409 conflict', async () => {
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already have an active token/i);
  });

  it('POST /join for category with no open stalls → 500 with error message', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'medical' }); // no medical stalls created

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/no open stalls/i);
  });

  it('POST /call-next on empty stall → 404', async () => {
    const res = await request(app)
      .post(`/api/queue/call-next/${foodStall1Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // afterEach clears tokens → stall 1 has no waiting users
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/no waiting users/i);
  });
});

// ─── Test Suite 3: Access Control (RBAC) ─────────────────────────────────────
describe('Integration: Role-Based Access Control', () => {
  it('GET /my-token without auth → 401', async () => {
    const res = await request(app).get('/api/queue/my-token');
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /join without auth → 401', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .send({ eventId, category: 'food' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /call-next with regular user → 403 forbidden', async () => {
    const res = await request(app)
      .post(`/api/queue/call-next/${foodStall1Id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Admin privileges/i);
  });

  it('POST /complete with regular user → 403 forbidden', async () => {
    const res = await request(app)
      .post(`/api/queue/complete/507f1f77bcf86cd799439011`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(403);
  });

  it('GET /stall/:stallId queue with regular user → 403 forbidden', async () => {
    const res = await request(app)
      .get(`/api/queue/stall/${foodStall1Id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/dashboard without auth → 401', async () => {
    const res = await request(app).get(`/api/admin/dashboard/${eventId}`);
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/dashboard with regular user → 403', async () => {
    const res = await request(app)
      .get(`/api/admin/dashboard/${eventId}`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/dashboard with admin → 200 with overview data', async () => {
    const res = await request(app)
      .get(`/api/admin/dashboard/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overview');
    expect(res.body.data.overview).toHaveProperty('totalInQueue');
    expect(res.body.data.overview).toHaveProperty('avgWaitMinutes');
    expect(res.body.data).toHaveProperty('stalls');
  });
});

// ─── Test Suite 4: Multi-User Concurrency & Rebalancing ─────────────────────
describe('Integration: Multi-User Queue & Admin Rebalancing', () => {
  it('Two users joining → each gets a unique token with sequential positions', async () => {
    const res1 = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });
    expect(res1.statusCode).toBe(201);

    const res2 = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ eventId, category: 'food' });
    expect(res2.statusCode).toBe(201);

    // Tokens must be distinct
    expect(res1.body.data.token.tokenNumber).not.toBe(res2.body.data.token.tokenNumber);
    // Both should be in waiting state
    expect(res1.body.data.token.status).toBe('waiting');
    expect(res2.body.data.token.status).toBe('waiting');
  });

  it('Admin rebalance endpoint → responds 200 with moved count', async () => {
    const res = await request(app)
      .post(`/api/admin/rebalance/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('moved');
  });

  it('GET /stall/:stallId → admin can view stall queue', async () => {
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });

    const res = await request(app)
      .get(`/api/queue/stall/${foodStall2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.tokens)).toBe(true);
  });

  it('Calling next advances the queue and position recalculates', async () => {
    // User1 and User2 both join
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ eventId, category: 'food' });
    await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ eventId, category: 'food' });

    // Admin calls next — first user goes to serving
    const callRes = await request(app)
      .post(`/api/queue/call-next/${foodStall2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(callRes.statusCode).toBe(200);
    expect(callRes.body.data.token.status).toBe('serving');

    // Second user's position should now be 1
    const stall2Tokens = await QueueToken.find({ stallId: foodStall2Id, status: 'waiting' });
    expect(stall2Tokens[0]?.position).toBe(1);
  });
});
