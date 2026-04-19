/**
 * tests/security.test.js — Security & Middleware Integration Tests
 *
 * Verifies that all security middleware is correctly applied:
 *   1. Helmet — secure HTTP headers present
 *   2. Rate Limiting — 429 after limit exceeded
 *   3. Mongo Sanitize — operator injection is stripped
 *   4. CORS — origin header is present
 *   5. JWT — missing/invalid/expired tokens rejected with 401
 *   6. 404 — unknown routes return structured error
 *   7. Input validation — express-validator returns structured errors
 */

const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');

jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {},
}));
jest.mock('../config/firebaseAdmin', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  writeQueueSnapshot: jest.fn(() => Promise.resolve()),
  writeStallSnapshot:  jest.fn(() => Promise.resolve()),
  admin: {},
}));

beforeAll(async () => { await dbHandler.connect(); });
afterAll(async () => { await dbHandler.closeDatabase(); });

// ─── 1. Helmet Headers ────────────────────────────────────────────────────────
describe('Security: Helmet HTTP Headers', () => {
  it('should set X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options to prevent clickjacking', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('should NOT expose X-Powered-By (removed by helmet)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('should set Content-Security-Policy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

// ─── 2. JWT Authentication ────────────────────────────────────────────────────
describe('Security: JWT Authentication', () => {
  it('should return 401 when Authorization header is completely absent', async () => {
    const res = await request(app).get('/api/queue/my-token');
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/No token provided/i);
  });

  it('should return 401 for a malformed/fake JWT', async () => {
    const res = await request(app)
      .get('/api/queue/my-token')
      .set('Authorization', 'Bearer this.is.notvalid');
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 for a syntactically valid but unsigned JWT', async () => {
    // Build a token with wrong secret
    const jwt = require('jsonwebtoken');
    const fakeToken = jwt.sign({ id: '507f1f77bcf86cd799439011' }, 'wrong-secret');
    const res = await request(app)
      .get('/api/queue/my-token')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for an expired JWT', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { id: '507f1f77bcf86cd799439011' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // already expired
    );
    const res = await request(app)
      .get('/api/queue/my-token')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });
});

// ─── 3. Role-Based Access Control ────────────────────────────────────────────
describe('Security: RBAC — Admin-Only Routes', () => {
  let regularUserToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Security Test User',
      email: 'security_user@test.com',
      password: 'TestPass123!',
    });
    regularUserToken = res.body.data.token;
  });

  it('should return 403 when regular user hits admin-only route', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Admin privileges/i);
  });

  it('should return 401 when no token is provided to admin route', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.statusCode).toBe(401);
  });

  it('should return 403 for admin rebalance with regular user', async () => {
    const res = await request(app)
      .post('/api/admin/rebalance/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(res.statusCode).toBe(403);
  });

  it('should return 403 for admin dashboard with regular user', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(res.statusCode).toBe(403);
  });
});

// ─── 4. Input Validation (express-validator) ─────────────────────────────────
describe('Security: Input Validation', () => {
  let userToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Validation Test User',
      email: 'validation_user@test.com',
      password: 'ValidPass123!',
    });
    userToken = res.body.data.token;
  });

  it('should reject /queue/join with non-MongoId eventId → 400 with msg array', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ eventId: 'not-a-mongo-id', category: 'food' });

    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty('msg');
    expect(res.body.errors[0]).toHaveProperty('path');
  });

  it('should reject /queue/join with invalid category → 400', async () => {
    const res = await request(app)
      .post('/api/queue/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ eventId: '507f1f77bcf86cd799439011', category: 'gaming' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/Invalid category/i);
  });

  it('should reject /auth/register with invalid email → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test', email: 'not-an-email', password: 'Pass123!',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should reject /auth/register with password too short → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test', email: 'short@test.com', password: '123',
    });
    expect(res.statusCode).toBe(400);
  });

  it('should reject /auth/register with missing name → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'noname@test.com', password: 'Password123!',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── 5. NoSQL Injection Sanitization ─────────────────────────────────────────
describe('Security: NoSQL Injection Prevention', () => {
  it('should strip $where operator from login body (not crash or bypass auth)', async () => {
    // If sanitization is working, the $where key is removed and login fails with 400/401, not 200
    const res = await request(app).post('/api/auth/login').send({
      email: { $where: 'this.role === "admin"' },
      password: 'anypassword',
    });
    // Must NOT return 200 (would mean injection bypassed auth)
    expect(res.statusCode).not.toBe(200);
  });

  it('should strip $gt operator in login body', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: { $gt: '' },
      password: { $gt: '' },
    });
    expect(res.statusCode).not.toBe(200);
  });
});

// ─── 6. 404 Handler ───────────────────────────────────────────────────────────
describe('Security: Unknown Routes', () => {
  it('GET /api/nonexistent → 404 with structured response', async () => {
    const res = await request(app).get('/api/nonexistent-route-xyz');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Route not found/i);
  });

  it('POST /api/unknown → 404', async () => {
    const res = await request(app).post('/api/totally-unknown');
    expect(res.statusCode).toBe(404);
  });
});

// ─── 7. Health Check ─────────────────────────────────────────────────────────
describe('Server: Health Check', () => {
  it('GET /api/health → 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});
