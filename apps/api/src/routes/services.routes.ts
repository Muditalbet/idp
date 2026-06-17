import { Router } from 'express';
import { z } from 'zod';
import {
  hostFor,
  namespaceFor,
  prisma,
  provisionQueue,
  publishEvent,
  type Prisma,
} from '@idp/shared';
import { asyncHandler, HttpError } from '../middleware/error';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../auth/middleware';
import { getServiceForUser, serviceScope } from '../lib/access';
import { uniqueServiceSlug } from '../lib/slug';
import { getTemplate } from '../lib/templates';
import { serializePipelineRun, serializeService } from '../lib/serialize';
import { audit } from '../lib/audit';

export const serviceRoutes = Router();

const detailInclude = {
  team: true,
  owner: true,
  environments: {
    include: { claim: true, deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ServiceInclude;

serviceRoutes.use(requireAuth);

// List services the caller can see.
serviceRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const services = await prisma.service.findMany({
      where: serviceScope(req),
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ services: services.map(serializeService) });
  }),
);

const createServiceSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().max(280).optional().default(''),
  repoUrl: z.string().url(),
  defaultBranch: z.string().min(1).default('main'),
  template: z.string().default('node-service'),
  containerPort: z.number().int().min(1).max(65535).default(8080),
  teamId: z.string().optional(),
  environments: z
    .array(z.string().regex(/^[a-z][a-z0-9-]*$/, 'env name must be a DNS label'))
    .min(1)
    .max(3)
    .default(['dev']),
});

// Scaffold a new service: creates Service + Environments + Claims, then enqueues
// provisioning for each environment (Crossplane-style claim fulfilment).
serviceRoutes.post(
  '/',
  validateBody(createServiceSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = req.body as z.infer<typeof createServiceSchema>;

    const teamId = body.teamId ?? user.teamId;
    if (!teamId) throw new HttpError(400, 'no_team', 'User has no team; specify teamId.');
    if (user.role !== 'PLATFORM_ADMIN' && teamId !== user.teamId) {
      throw new HttpError(403, 'forbidden');
    }
    if (!getTemplate(body.template)) throw new HttpError(400, 'unknown_template');

    const envNames = [...new Set(body.environments)];
    const slug = await uniqueServiceSlug(body.name);

    const service = await prisma.service.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        repoUrl: body.repoUrl,
        defaultBranch: body.defaultBranch,
        template: body.template,
        containerPort: body.containerPort,
        teamId,
        ownerId: user.id,
        environments: {
          create: envNames.map((envName) => ({
            name: envName,
            namespace: namespaceFor(slug, envName),
            host: hostFor(slug, envName),
            replicas: 1,
            claim: { create: { status: 'PENDING' } },
          })),
        },
      },
      include: detailInclude,
    });

    const ts = new Date().toISOString();
    for (const e of service.environments) {
      await provisionQueue.add('provision', { environmentId: e.id, actorId: user.id });
      if (e.claim) {
        await publishEvent({
          type: 'claim.status',
          serviceId: service.id,
          serviceSlug: slug,
          environmentId: e.id,
          claimId: e.claim.id,
          status: 'PENDING',
          message: 'Claim queued for provisioning',
          ts,
        });
      }
    }

    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'service.create',
      targetType: 'service',
      targetId: service.id,
      metadata: { slug, environments: envNames },
    });

    res.status(201).json({ service: serializeService(service) });
  }),
);

// Service detail.
serviceRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = await getServiceForUser(req, req.params.id!, detailInclude);
    res.json({ service: serializeService(service) });
  }),
);

// Pipeline history for a service.
serviceRoutes.get(
  '/:id/pipelines',
  asyncHandler(async (req, res) => {
    await getServiceForUser(req, req.params.id!);
    const runs = await prisma.pipelineRun.findMany({
      where: { serviceId: req.params.id! },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ pipelineRuns: runs.map(serializePipelineRun) });
  }),
);

// Deprovision a service (owner or admin): tears down infra + DB record.
serviceRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = await getServiceForUser(req, req.params.id!);
    const environments = await prisma.environment.findMany({
      where: { serviceId: service.id },
      select: { id: true },
    });
    // Enqueue teardown of each environment's namespace before deleting rows.
    for (const e of environments) {
      await provisionQueue.add('deprovision', { environmentId: e.id, actorId: req.user!.id });
    }
    await audit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'service.delete',
      targetType: 'service',
      targetId: service.id,
    });
    res.status(202).json({ status: 'deprovisioning' });
  }),
);
