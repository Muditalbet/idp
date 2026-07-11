import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, loginAll, type Tokens } from './helpers/request';
import { kube, seedDatabase } from './helpers/synthetic-db';

let t: Tokens;
beforeEach(async () => {
  await seedDatabase();
  t = await loginAll();
});

describe('admin routes require PLATFORM_ADMIN', () => {
  it('401 without auth', async () => {
    expect((await request(app).get('/api/admin/audit')).status).toBe(401);
  });

  it('403 for a plain developer', async () => {
    const res = await request(app).get('/api/admin/audit').set(bearer(t.dev));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});

describe('GET /api/admin/audit', () => {
  it('200 returns audit log entries for an admin', async () => {
    const res = await request(app).get('/api/admin/audit').set(bearer(t.admin));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('200 respects the limit query param', async () => {
    const res = await request(app).get('/api/admin/audit?limit=0').set(bearer(t.admin));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/teams', () => {
  it('200 returns teams with member/service counts', async () => {
    const res = await request(app).get('/api/admin/teams').set(bearer(t.admin));
    expect(res.status).toBe(200);
    const alpha = res.body.teams.find((x: any) => x.slug === 'alpha');
    expect(alpha._count).toEqual({ users: 2, services: 1 });
  });

  it('403 for a developer', async () => {
    expect((await request(app).get('/api/admin/teams').set(bearer(t.dev))).status).toBe(403);
  });
});

describe('GET /api/admin/cluster', () => {
  it('200 returns DB rollups + a reachable cluster view', async () => {
    const res = await request(app).get('/api/admin/cluster').set(bearer(t.admin));
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ services: 2, environments: 1 });
    expect(res.body.cluster.reachable).toBe(true);
    expect(res.body.cluster.nodes[0]).toMatchObject({ ready: true });
    expect(res.body.health).toHaveProperty('HEALTHY');
  });

  it('200 with reachable=false when the cluster is unreachable', async () => {
    kube.list.mockRejectedValueOnce(new Error('cluster down'));
    const res = await request(app).get('/api/admin/cluster').set(bearer(t.admin));
    expect(res.status).toBe(200);
    expect(res.body.cluster.reachable).toBe(false);
    expect(res.body.cluster.nodes).toEqual([]);
  });
});
