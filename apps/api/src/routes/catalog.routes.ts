import { Router } from 'express';
import { prisma } from '@idp/shared';
import { asyncHandler } from '../middleware/error';
import { requireAuth } from '../auth/middleware';
import { TEMPLATES } from '../lib/templates';

export const catalogRoutes = Router();
catalogRoutes.use(requireAuth);

// Scaffolder templates available to developers.
catalogRoutes.get('/templates', (_req, res) => {
  res.json({ templates: TEMPLATES });
});

// Teams the caller may assign a new service to.
catalogRoutes.get(
  '/teams',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const teams =
      user.role === 'PLATFORM_ADMIN'
        ? await prisma.team.findMany({ orderBy: { name: 'asc' } })
        : await prisma.team.findMany({ where: { id: user.teamId ?? '__none__' } });
    res.json({ teams: teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug })) });
  }),
);
