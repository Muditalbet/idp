import { Router } from 'express';
import { kube, prisma } from '@idp/shared';
import { asyncHandler } from '../middleware/error';
import { requireAuth, requireRole } from '../auth/middleware';

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('PLATFORM_ADMIN'));

adminRoutes.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await prisma.auditLog.findMany({ orderBy: { ts: 'desc' }, take: limit });
    res.json({ logs });
  }),
);

adminRoutes.get(
  '/teams',
  asyncHandler(async (_req, res) => {
    const teams = await prisma.team.findMany({
      include: { _count: { select: { users: true, services: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ teams });
  }),
);

// Cluster overview: DB rollups + a best-effort live read of cluster nodes.
adminRoutes.get(
  '/cluster',
  asyncHandler(async (_req, res) => {
    const [services, environments, deployments, runs] = await Promise.all([
      prisma.service.count(),
      prisma.environment.count(),
      prisma.deployment.count({ where: { status: 'DEPLOYED' } }),
      prisma.pipelineRun.count(),
    ]);

    const health = await prisma.environment.groupBy({
      by: ['healthStatus'],
      _count: { _all: true },
    });

    let nodes: { name: string; ready: boolean; version: string }[] = [];
    let reachable = true;
    try {
      const raw = await kube.list<{
        metadata: { name: string };
        status: { conditions?: { type: string; status: string }[]; nodeInfo?: { kubeletVersion?: string } };
      }>('nodes');
      nodes = raw.map((n) => ({
        name: n.metadata.name,
        ready:
          n.status.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false,
        version: n.status.nodeInfo?.kubeletVersion ?? 'unknown',
      }));
    } catch {
      reachable = false;
    }

    res.json({
      counts: { services, environments, deployments, pipelineRuns: runs },
      health: Object.fromEntries(health.map((h) => [h.healthStatus, h._count._all])),
      cluster: { reachable, nodes },
    });
  }),
);
