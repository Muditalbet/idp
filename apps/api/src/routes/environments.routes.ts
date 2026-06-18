import { Router } from 'express';
import { z } from 'zod';
import {
  prisma,
  pipelineQueue,
  reconcileQueue,
  publishEvent,
} from '@idp/shared';
import { asyncHandler, HttpError } from '../middleware/error';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../auth/middleware';
import { getEnvironmentForUser } from '../lib/access';
import { serializeEnvironment, serializePipelineRun } from '../lib/serialize';
import { audit } from '../lib/audit';

export const environmentRoutes = Router();
environmentRoutes.use(requireAuth);

environmentRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    res.json({ environment: serializeEnvironment(env) });
  }),
);

// Render the desired-state manifest bundle (transparency / drift inspection).
environmentRoutes.get(
  '/:id/manifest',
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    res.json({ manifest: env.desiredManifest ?? null });
  }),
);

// Trigger a deployment pipeline (the portal "Deploy" button).
const deploySchema = z.object({ ref: z.string().optional() });
environmentRoutes.post(
  '/:id/deploy',
  validateBody(deploySchema),
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    const { ref } = req.body as z.infer<typeof deploySchema>;

    const run = await prisma.pipelineRun.create({
      data: {
        serviceId: env.serviceId,
        environmentId: env.id,
        trigger: 'MANUAL',
        status: 'QUEUED',
        commitSha: ref,
        triggeredById: req.user!.id,
      },
    });
    await pipelineQueue.add('pipeline', { runId: run.id });
    await publishEvent({
      type: 'pipeline.status',
      serviceId: env.serviceId,
      environmentId: env.id,
      runId: run.id,
      status: 'QUEUED',
      ts: new Date().toISOString(),
    });
    await audit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'environment.deploy',
      targetType: 'environment',
      targetId: env.id,
    });
    res.status(202).json({ pipelineRun: serializePipelineRun(run) });
  }),
);

// Roll back to a previous deployment's image (defaults to the prior success).
const rollbackSchema = z.object({ deploymentId: z.string().optional() });
environmentRoutes.post(
  '/:id/rollback',
  validateBody(rollbackSchema),
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    const { deploymentId } = req.body as z.infer<typeof rollbackSchema>;

    const target = deploymentId
      ? await prisma.deployment.findFirst({
          where: { id: deploymentId, environmentId: env.id, status: { in: ['DEPLOYED', 'SUPERSEDED'] } },
        })
      : await prisma.deployment.findFirst({
          where: { environmentId: env.id, status: { in: ['DEPLOYED', 'SUPERSEDED'] } },
          orderBy: { createdAt: 'desc' },
          skip: 1,
        });
    if (!target) throw new HttpError(400, 'no_rollback_target');

    await prisma.environment.update({
      where: { id: env.id },
      data: { desiredImage: target.image, syncStatus: 'OUT_OF_SYNC' },
    });
    const deployment = await prisma.deployment.create({
      data: {
        environmentId: env.id,
        image: target.image,
        commitSha: target.commitSha,
        commitMessage: `rollback to ${target.image}`,
        status: 'DEPLOYING',
      },
    });
    await reconcileQueue.add('reconcile', { environmentId: env.id, reason: 'rollback' });
    await publishEvent({
      type: 'deployment.status',
      serviceId: env.serviceId,
      environmentId: env.id,
      deploymentId: deployment.id,
      status: 'DEPLOYING',
      image: target.image,
      ts: new Date().toISOString(),
    });
    await audit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'environment.rollback',
      targetType: 'environment',
      targetId: env.id,
      metadata: { image: target.image },
    });
    res.status(202).json({ deployment });
  }),
);

// Force a reconcile (re-apply desired state, refresh sync/health).
environmentRoutes.post(
  '/:id/reconcile',
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    await reconcileQueue.add('reconcile', { environmentId: env.id, reason: 'manual' });
    res.status(202).json({ status: 'queued' });
  }),
);

// Time-series metrics for the observability dashboard.
const RANGE_MS: Record<string, number> = {
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

environmentRoutes.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const env = await getEnvironmentForUser(req, req.params.id!);
    const range = (req.query.range as string) || '30m';
    const windowMs = RANGE_MS[range] ?? RANGE_MS['30m']!;
    const since = new Date(Date.now() - windowMs);
    const names =
      typeof req.query.names === 'string' && req.query.names.length > 0
        ? req.query.names.split(',')
        : undefined;

    const samples = await prisma.metricSample.findMany({
      where: { environmentId: env.id, ts: { gte: since }, ...(names ? { name: { in: names } } : {}) },
      orderBy: { ts: 'asc' },
      take: 5000,
    });

    const series: Record<string, { ts: Date; value: number }[]> = {};
    for (const s of samples) {
      (series[s.name] ??= []).push({ ts: s.ts, value: s.value });
    }
    res.json({ range, series });
  }),
);
