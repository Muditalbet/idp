import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@idp/shared';
import { asyncHandler, HttpError } from '../middleware/error';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { publicUser } from '../lib/serialize';
import { audit } from '../lib/audit';

export const authRoutes = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email }, include: { team: true } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'invalid_credentials');
    }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token, user: publicUser(user) });
  }),
);

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(60),
  password: z.string().min(6).max(100),
  teamSlug: z.string().optional(),
});

authRoutes.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, name, password, teamSlug } = req.body as z.infer<typeof registerSchema>;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, 'email_taken');

    const team = teamSlug ? await prisma.team.findUnique({ where: { slug: teamSlug } }) : null;
    if (teamSlug && !team) throw new HttpError(400, 'unknown_team');

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role: 'DEVELOPER',
        teamId: team?.id ?? null,
      },
      include: { team: true },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'user.register', targetType: 'user', targetId: user.id });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: publicUser(user) });
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { team: true },
    });
    if (!user) throw new HttpError(404, 'user_not_found');
    res.json({ user: publicUser(user) });
  }),
);
