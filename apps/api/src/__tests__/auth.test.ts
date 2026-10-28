/**
 * Auth route tests — run with: npm run test --prefix apps/api
 * Uses in-memory mocks; does not require a live database.
 */

import request from 'supertest';

// Mock the database pool before importing app
jest.mock('../database/pool', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(true),
  withTransaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: jest.fn() })),
  getPool: jest.fn(() => ({ query: jest.fn() })),
  initPool: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/redis', () => ({
  redis: {
    available: false,
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    health: jest.fn().mockResolvedValue(false),
    rateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
  },
}));

import { query, queryOne } from '../database/pool';
import app from '../index';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('rejects missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        name: 'Test',
        password: '123',
      });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'existing-id' });
      const res = await request(app).post('/api/auth/register').send({
        email: 'exists@example.com',
        name: 'Test',
        password: 'password123',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects invalid credentials', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(401);
    });

    it('rejects missing body', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body.services).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });
});

describe('Tool Validation', () => {
  it('calculator handles valid expressions', async () => {
    const { registry } = await import('../tools/registry');
    const ctx = { userId: 'u1', workspaceId: 'w1' };
    const result = await registry.execute('calculator', { expression: '2 + 2 * 10' }, ctx, ['calculator']);
    expect(result.success).toBe(true);
    expect((result.result as { result: number }).result).toBe(22);
  });

  it('calculator blocks non-permitted tools', async () => {
    const { registry } = await import('../tools/registry');
    const ctx = { userId: 'u1', workspaceId: 'w1' };
    const result = await registry.execute('calculator', { expression: '1+1' }, ctx, []);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });

  it('get_current_datetime returns timestamp', async () => {
    const { registry } = await import('../tools/registry');
    const ctx = { userId: 'u1', workspaceId: 'w1' };
    const result = await registry.execute('get_current_datetime', {}, ctx, ['get_current_datetime']);
    expect(result.success).toBe(true);
    expect((result.result as { iso: string }).iso).toBeDefined();
  });

  it('unknown tool returns error', async () => {
    const { registry } = await import('../tools/registry');
    const ctx = { userId: 'u1', workspaceId: 'w1' };
    const result = await registry.execute('nonexistent_tool', {}, ctx, ['nonexistent_tool']);
    expect(result.success).toBe(false);
  });
});
