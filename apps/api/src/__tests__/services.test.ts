import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, loginAll, type Tokens } from './helpers/request';
import { provisionQueue, seeded, seedDatabase } from './helpers/synthetic-db';

let t: Tokens;
beforeEach(async () => {
  await seedDatabase();
  t = await loginAll();
});

describe('GET /api/services', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(401);
  });

  it('admin sees every team’s services', async () => {
    const res = await request(app).get('/api/services').set(bearer(t.admin));
    expect(res.status).toBe(200);
    const slugs = res.body.services.map((s: any) => s.slug).sort();
    expect(slugs).toEqual(['billing', 'payments']);
  });

  it('a developer only sees their own team’s services', async () => {
    const res = await request(app).get('/api/services').set(bearer(t.dev));
    expect(res.status).toBe(200);
    const slugs = res.body.services.map((s: any) => s.slug);
    expect(slugs).toEqual(['payments']); // team alpha only, not billing (team beta)
  });
});

describe('POST /api/services', () => {
  const valid = {
    name: 'Orders',
    repoUrl: 'https://github.com/acme/orders',
    environments: ['dev', 'staging'],
  };

  it('201 creates a service, its environments and enqueues provisioning', async () => {
    const res = await request(app).post('/api/services').set(bearer(t.dev)).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.service).toMatchObject({ name: 'Orders', slug: 'orders' });
    expect(res.body.service.environments).toHaveLength(2);
    // one provision job enqueued per environment
    expect(provisionQueue.add).toHaveBeenCalledTimes(2);
  });

  it('401 without auth', async () => {
    const res = await request(app).post('/api/services').send(valid);
    expect(res.status).toBe(401);
  });

  it('400 validation_error for a missing name', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.dev))
      .send({ repoUrl: 'https://github.com/acme/x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('400 validation_error for a non-URL repoUrl', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.dev))
      .send({ name: 'Bad', repoUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('400 validation_error for an invalid environment name', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.dev))
      .send({ ...valid, environments: ['Bad_Env'] });
    expect(res.status).toBe(400);
  });

  it('400 no_team when a teamless user omits teamId', async () => {
    const res = await request(app).post('/api/services').set(bearer(t.teamless)).send(valid);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_team');
  });

  it('403 forbidden when a developer targets another team', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.dev))
      .send({ ...valid, teamId: seeded.teams.beta.id });
    expect(res.status).toBe(403);
  });

  it('admin may create a service for any team', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.admin))
      .send({ ...valid, teamId: seeded.teams.beta.id });
    expect(res.status).toBe(201);
    expect(res.body.service.teamId).toBe(seeded.teams.beta.id);
  });

  it('400 unknown_template for a bad template', async () => {
    const res = await request(app)
      .post('/api/services')
      .set(bearer(t.dev))
      .send({ ...valid, template: 'ghost-template' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_template');
  });
});

describe('GET /api/services/:id', () => {
  it('200 for a service on the caller’s team', async () => {
    const res = await request(app).get(`/api/services/${seeded.services.payments.id}`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.service.slug).toBe('payments');
  });

  it('404 service_not_found for an unknown id', async () => {
    const res = await request(app).get('/api/services/does-not-exist').set(bearer(t.dev));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('service_not_found');
  });

  it('403 forbidden across teams', async () => {
    const res = await request(app).get(`/api/services/${seeded.services.billing.id}`).set(bearer(t.dev));
    expect(res.status).toBe(403);
  });

  it('admin may read any service', async () => {
    const res = await request(app).get(`/api/services/${seeded.services.billing.id}`).set(bearer(t.admin));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/services/:id/pipelines', () => {
  it('200 returns the service’s pipeline history', async () => {
    const res = await request(app)
      .get(`/api/services/${seeded.services.payments.id}/pipelines`)
      .set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pipelineRuns)).toBe(true);
    expect(res.body.pipelineRuns.length).toBeGreaterThanOrEqual(1);
  });

  it('403 across teams', async () => {
    const res = await request(app)
      .get(`/api/services/${seeded.services.billing.id}/pipelines`)
      .set(bearer(t.dev));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/services/:id', () => {
  it('202 deprovisioning and enqueues teardown', async () => {
    const res = await request(app).delete(`/api/services/${seeded.services.payments.id}`).set(bearer(t.dev));
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('deprovisioning');
    expect(provisionQueue.add).toHaveBeenCalledWith('deprovision', expect.objectContaining({}));
  });

  it('403 when deleting another team’s service', async () => {
    const res = await request(app).delete(`/api/services/${seeded.services.billing.id}`).set(bearer(t.dev));
    expect(res.status).toBe(403);
  });

  it('404 for an unknown service', async () => {
    const res = await request(app).delete('/api/services/nope').set(bearer(t.dev));
    expect(res.status).toBe(404);
  });
});
