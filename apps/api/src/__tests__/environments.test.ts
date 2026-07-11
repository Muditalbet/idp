import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, loginAll, type Tokens } from './helpers/request';
import { pipelineQueue, reconcileQueue, seeded, seedDatabase, tables } from './helpers/synthetic-db';

let t: Tokens;
let envId: string;
beforeEach(async () => {
  await seedDatabase();
  t = await loginAll();
  envId = seeded.env.id;
});

describe('GET /api/environments/:id', () => {
  it('200 with the serialized environment', async () => {
    const res = await request(app).get(`/api/environments/${envId}`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.environment).toMatchObject({ id: envId, name: 'dev', syncStatus: 'SYNCED' });
    expect(res.body.environment.url).toContain('.nip.io');
  });

  it('401 without auth', async () => {
    const res = await request(app).get(`/api/environments/${envId}`);
    expect(res.status).toBe(401);
  });

  it('404 environment_not_found for an unknown id', async () => {
    const res = await request(app).get('/api/environments/nope').set(bearer(t.dev));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('environment_not_found');
  });

  it('403 across teams', async () => {
    const res = await request(app).get(`/api/environments/${envId}`).set(bearer(t.otherDev));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/environments/:id/manifest', () => {
  it('200 returns the stored desired manifest', async () => {
    const res = await request(app).get(`/api/environments/${envId}/manifest`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.manifest).toEqual([{ kind: 'Deployment', metadata: { name: 'payments' } }]);
  });
});

describe('POST /api/environments/:id/deploy', () => {
  it('202 queues a MANUAL pipeline run', async () => {
    const res = await request(app).post(`/api/environments/${envId}/deploy`).set(bearer(t.dev)).send({});
    expect(res.status).toBe(202);
    expect(res.body.pipelineRun).toMatchObject({ trigger: 'MANUAL', status: 'QUEUED' });
    expect(pipelineQueue.add).toHaveBeenCalledTimes(1);
  });

  it('202 accepts an optional ref', async () => {
    const res = await request(app)
      .post(`/api/environments/${envId}/deploy`)
      .set(bearer(t.dev))
      .send({ ref: 'feature-x' });
    expect(res.status).toBe(202);
    expect(res.body.pipelineRun.commitSha).toBe('feature-x');
  });

  it('403 across teams', async () => {
    const res = await request(app).post(`/api/environments/${envId}/deploy`).set(bearer(t.otherDev)).send({});
    expect(res.status).toBe(403);
  });

  it('404 for an unknown environment', async () => {
    const res = await request(app).post('/api/environments/nope/deploy').set(bearer(t.dev)).send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/environments/:id/rollback', () => {
  it('202 rolls back to the prior deployment by default', async () => {
    const res = await request(app).post(`/api/environments/${envId}/rollback`).set(bearer(t.dev)).send({});
    expect(res.status).toBe(202);
    expect(res.body.deployment).toMatchObject({ status: 'DEPLOYING', image: seeded.deployments.previous.image });
    expect(reconcileQueue.add).toHaveBeenCalledWith('reconcile', expect.objectContaining({ reason: 'rollback' }));
  });

  it('202 rolls back to a specified deploymentId', async () => {
    const res = await request(app)
      .post(`/api/environments/${envId}/rollback`)
      .set(bearer(t.dev))
      .send({ deploymentId: seeded.deployments.previous.id });
    expect(res.status).toBe(202);
    expect(res.body.deployment.image).toBe(seeded.deployments.previous.image);
  });

  it('400 no_rollback_target when there is no prior deployment', async () => {
    // Drop history down to a single deployment so skip:1 finds nothing.
    tables.deployment.length = 0;
    const res = await request(app).post(`/api/environments/${envId}/rollback`).set(bearer(t.dev)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_rollback_target');
  });

  it('403 across teams', async () => {
    const res = await request(app).post(`/api/environments/${envId}/rollback`).set(bearer(t.otherDev)).send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /api/environments/:id/reconcile', () => {
  it('202 queued and enqueues a manual reconcile', async () => {
    const res = await request(app).post(`/api/environments/${envId}/reconcile`).set(bearer(t.dev)).send({});
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
    expect(reconcileQueue.add).toHaveBeenCalledWith('reconcile', expect.objectContaining({ reason: 'manual' }));
  });

  it('403 across teams', async () => {
    const res = await request(app).post(`/api/environments/${envId}/reconcile`).set(bearer(t.otherDev)).send({});
    expect(res.status).toBe(403);
  });
});

describe('GET /api/environments/:id/metrics', () => {
  it('200 returns grouped time-series', async () => {
    const res = await request(app).get(`/api/environments/${envId}/metrics`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('30m');
    expect(res.body.series).toHaveProperty('cpu_millicores');
    expect(res.body.series).toHaveProperty('memory_mb');
  });

  it('200 honours the range query param', async () => {
    const res = await request(app).get(`/api/environments/${envId}/metrics?range=1h`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('1h');
  });

  it('200 filters by names', async () => {
    const res = await request(app)
      .get(`/api/environments/${envId}/metrics?names=cpu_millicores`)
      .set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.series)).toEqual(['cpu_millicores']);
  });

  it('403 across teams', async () => {
    const res = await request(app).get(`/api/environments/${envId}/metrics`).set(bearer(t.otherDev));
    expect(res.status).toBe(403);
  });
});
