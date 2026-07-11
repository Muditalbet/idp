import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer } from './helpers/request';
import { CREDENTIALS, seedDatabase } from './helpers/synthetic-db';

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it('200 + token for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDENTIALS.dev);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ email: CREDENTIALS.dev.email, role: 'DEVELOPER' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('401 invalid_credentials for a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDENTIALS.dev.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('401 invalid_credentials for an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@idp.local', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('400 validation_error for a malformed email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('400 validation_error when the password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: CREDENTIALS.dev.email });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it('201 + token for a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newbie@idp.local', name: 'New Bie', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ email: 'newbie@idp.local', role: 'DEVELOPER' });
  });

  it('201 and associates a valid teamSlug', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'teamed@idp.local', name: 'Teamed', password: 'secret123', teamSlug: 'alpha' });
    expect(res.status).toBe(201);
    expect(res.body.user.team).toMatchObject({ slug: 'alpha' });
  });

  it('409 email_taken for a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: CREDENTIALS.dev.email, name: 'Dupe', password: 'secret123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });

  it('400 unknown_team for a non-existent teamSlug', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@idp.local', name: 'Ex', password: 'secret123', teamSlug: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_team');
  });

  it('400 validation_error for a too-short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@idp.local', name: 'Ex', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  it('200 with the current user when authenticated', async () => {
    const login = await request(app).post('/api/auth/login').send(CREDENTIALS.admin);
    const res = await request(app).get('/api/auth/me').set(bearer(login.body.token));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: CREDENTIALS.admin.email, role: 'PLATFORM_ADMIN' });
  });

  it('401 unauthorized without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('401 invalid_token for a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer('garbage.token.value'));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });
});
