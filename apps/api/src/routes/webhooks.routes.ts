import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma, pipelineQueue, publishEvent } from '@idp/shared';
import { asyncHandler, HttpError } from '../middleware/error';
import { config } from '../config';

export const webhookRoutes = Router();

/** Normalise a git URL to host/path for fuzzy matching (https/ssh, .git suffix). */
function normalizeRepo(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

function verifySignature(raw: Buffer | undefined, signature: string | undefined): void {
  if (!raw || !signature) throw new HttpError(401, 'missing_signature');
  const expected =
    'sha256=' + crypto.createHmac('sha256', config.githubWebhookSecret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'invalid_signature');
  }
}

// GitHub push webhook → trigger CI/CD for matching services on their default branch.
webhookRoutes.post(
  '/github',
  asyncHandler(async (req, res) => {
    verifySignature(req.rawBody, req.headers['x-hub-signature-256'] as string | undefined);
    const eventType = req.headers['x-github-event'];
    if (eventType !== 'push') {
      res.json({ ignored: true, reason: `unsupported event: ${String(eventType)}` });
      return;
    }

    const payload = req.body as {
      ref?: string;
      after?: string;
      repository?: { clone_url?: string; html_url?: string; ssh_url?: string };
      head_commit?: { message?: string };
    };
    const branch = payload.ref?.replace('refs/heads/', '');
    const candidates = [
      payload.repository?.clone_url,
      payload.repository?.html_url,
      payload.repository?.ssh_url,
    ]
      .filter(Boolean)
      .map((u) => normalizeRepo(u as string));

    const services = await prisma.service.findMany({ include: { environments: true } });
    const matched = services.filter((s) => candidates.includes(normalizeRepo(s.repoUrl)));

    const triggered: string[] = [];
    for (const service of matched) {
      if (branch && service.defaultBranch !== branch) continue;
      for (const env of service.environments) {
        const run = await prisma.pipelineRun.create({
          data: {
            serviceId: service.id,
            environmentId: env.id,
            trigger: 'WEBHOOK',
            status: 'QUEUED',
            commitSha: payload.after?.slice(0, 7),
            commitMessage: payload.head_commit?.message,
          },
        });
        await pipelineQueue.add('pipeline', { runId: run.id });
        await publishEvent({
          type: 'pipeline.status',
          serviceId: service.id,
          serviceSlug: service.slug,
          environmentId: env.id,
          runId: run.id,
          status: 'QUEUED',
          commitSha: payload.after?.slice(0, 7),
          ts: new Date().toISOString(),
        });
        triggered.push(run.id);
      }
    }

    res.json({ triggered, matchedServices: matched.map((s) => s.slug) });
  }),
);
