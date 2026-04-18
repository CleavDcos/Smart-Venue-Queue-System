const request = require('supertest');
const app = require('../server');
const dbHandler = require('./setup');
const User = require('../models/User');

// Mock external services to avoid errors
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => null),
  getMessaging: jest.fn(() => null),
  admin: {}
}));

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Auth APIs', () => {
  const testUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  };

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('email', testUser.email);
    });

    it('should not allow duplicate email registration', async () => {
      // Create first user
      await request(app).post('/api/auth/register').send(testUser);

      // Attempt to create duplicate
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, name: 'Different Name' });

      expect(res.statusCode).toEqual(409);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login optimally with valid credentials', async () => {
      // Register first
      await request(app).post('/api/auth/register').send(testUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
    });

    it('should fail to login with invalid credentials', async () => {
      // Register first
      await request(app).post('/api/auth/register').send(testUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('success', false);
    });
  });
});
