import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, loginAll, type Tokens } from './helpers/request';
import { seeded, seedDatabase } from './helpers/synthetic-db';

let t: Tokens;
beforeEach(async () => {
  await seedDatabase();
  t = await loginAll();
});

describe('GET /api/pipelines/:id', () => {
  it('200 returns a run with its ordered logs', async () => {
    const res = await request(app).get(`/api/pipelines/${seeded.pipelineRun.id}`).set(bearer(t.dev));
    expect(res.status).toBe(200);
    expect(res.body.pipelineRun).toMatchObject({ id: seeded.pipelineRun.id, status: 'SUCCESS' });
    expect(res.body.pipelineRun.logs).toHaveLength(2);
    expect(res.body.pipelineRun.logs[0].step).toBe('CLONE');
  });

  it('401 without auth', async () => {
    const res = await request(app).get(`/api/pipelines/${seeded.pipelineRun.id}`);
    expect(res.status).toBe(401);
  });

  it('404 pipeline_not_found for an unknown id', async () => {
    const res = await request(app).get('/api/pipelines/nope').set(bearer(t.dev));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('pipeline_not_found');
  });

  it('403 forbidden across teams', async () => {
    const res = await request(app).get(`/api/pipelines/${seeded.pipelineRun.id}`).set(bearer(t.otherDev));
    expect(res.status).toBe(403);
  });

  it('admin may read any pipeline run', async () => {
    const res = await request(app).get(`/api/pipelines/${seeded.pipelineRun.id}`).set(bearer(t.admin));
    expect(res.status).toBe(200);
  });
});
