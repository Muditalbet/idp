import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/request';
import { env, pipelineQueue, seedDatabase } from './helpers/synthetic-db';

beforeEach(async () => {
  await seedDatabase();
});

function sign(raw: string): string {
  return 'sha256=' + crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(raw).digest('hex');
}

/** POST a GitHub webhook with a correctly-signed raw body. */
function postWebhook(payload: unknown, event = 'push', signer: (raw: string) => string = sign) {
  const raw = JSON.stringify(payload);
  return request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('x-github-event', event)
    .set('x-hub-signature-256', signer(raw))
    .send(raw);
}

const pushToPayments = {
  ref: 'refs/heads/main',
  after: 'deadbeefcafe',
  repository: { clone_url: 'https://github.com/acme/payments.git', html_url: 'https://github.com/acme/payments' },
  head_commit: { message: 'ship it' },
};

describe('POST /api/webhooks/github', () => {
  it('401 missing_signature when no signature header is sent', async () => {
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .send(JSON.stringify(pushToPayments));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_signature');
  });

  it('401 invalid_signature for a wrong signature', async () => {
    const res = await postWebhook(pushToPayments, 'push', () => 'sha256=' + '0'.repeat(64));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('200 ignored for a non-push event (valid signature)', async () => {
    const res = await postWebhook(pushToPayments, 'ping');
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);
  });

  it('200 triggers a pipeline for a matching push on the default branch', async () => {
    const res = await postWebhook(pushToPayments);
    expect(res.status).toBe(200);
    expect(res.body.matchedServices).toEqual(['payments']);
    expect(res.body.triggered).toHaveLength(1);
    expect(pipelineQueue.add).toHaveBeenCalledTimes(1);
  });

  it('200 but no trigger when the push targets a non-default branch', async () => {
    const res = await postWebhook({ ...pushToPayments, ref: 'refs/heads/feature-x' });
    expect(res.status).toBe(200);
    expect(res.body.matchedServices).toEqual(['payments']);
    expect(res.body.triggered).toHaveLength(0);
    expect(pipelineQueue.add).not.toHaveBeenCalled();
  });

  it('200 with no matches for an unknown repository', async () => {
    const res = await postWebhook({
      ...pushToPayments,
      repository: { clone_url: 'https://github.com/acme/unknown.git' },
    });
    expect(res.status).toBe(200);
    expect(res.body.matchedServices).toEqual([]);
    expect(res.body.triggered).toHaveLength(0);
  });
});
