import { Router } from 'express';
import { prisma } from '@idp/shared';
import { asyncHandler, HttpError } from '../middleware/error';
import { requireAuth } from '../auth/middleware';
import { serializePipelineRun } from '../lib/serialize';

export const pipelineRoutes = Router();
pipelineRoutes.use(requireAuth);

// A pipeline run with its full ordered log history.
pipelineRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: req.params.id! },
      include: { logs: { orderBy: { ts: 'asc' } }, service: { select: { teamId: true } } },
    });
    if (!run) throw new HttpError(404, 'pipeline_not_found');
    const user = req.user!;
    if (user.role !== 'PLATFORM_ADMIN' && run.service.teamId !== user.teamId) {
      throw new HttpError(403, 'forbidden');
    }
    res.json({ pipelineRun: serializePipelineRun(run) });
  }),
);
