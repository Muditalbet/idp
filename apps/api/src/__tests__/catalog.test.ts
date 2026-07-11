import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, loginAll, type Tokens } from './helpers/request';
import { seedDatabase } from './helpers/synthetic-db';

let t: Tokens;
beforeEach(async () => {
  await seedDatabase();
  t = await loginAll();
});

describe('GET /api/catalog/templates', () => {
  it('200 lists scaffolder templates', async () => {
    const res = await request(app).get('/api/catalog/templates').set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.templates[0]).toMatchObject({ id: 'node-service' });
  });

  it('401 without auth', async () => {
    expect((await request(app).get('/api/catalog/templates')).status).toBe(401);
  });
});

describe('GET /api/catalog/teams', () => {
  it('admin sees all teams', async () => {
    const res = await request(app).get('/api/catalog/teams').set(bearer(t.admin));
    expect(res.status).toBe(200);
    expect(res.body.teams.map((x: any) => x.slug).sort()).toEqual(['alpha', 'beta']);
  });

  it('a developer only sees their own team', async () => {
    const res = await request(app).get('/api/catalog/teams').set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.teams.map((x: any) => x.slug)).toEqual(['alpha']);
  });

  it('a teamless developer sees no teams', async () => {
    const res = await request(app).get('/api/catalog/teams').set(bearer(t.teamless));
    expect(res.status).toBe(200);
    expect(res.body.teams).toEqual([]);
  });
});
