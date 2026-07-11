import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/request';
import { redis, prisma, seedDatabase } from './helpers/synthetic-db';

describe('health & 404 handling', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it('GET /healthz → 200 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz → 200 ready when DB + Redis respond', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('GET /readyz → 503 not_ready when Redis is down', async () => {
    redis.ping.mockRejectedValueOnce(new Error('redis down'));
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('GET /readyz → 503 not_ready when the DB is down', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('unknown route → 404 not_found', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
