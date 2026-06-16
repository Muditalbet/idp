import type { RequestHandler } from 'express';
import { prisma, type Role } from '@idp/shared';
import { HttpError } from '../middleware/error';
import { verifyToken } from './jwt';

/** Require a valid Bearer token; attaches `req.user`. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new HttpError(401, 'unauthorized');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, 'invalid_token');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new HttpError(401, 'unauthorized');

    req.user = { id: user.id, email: user.email, role: user.role, teamId: user.teamId };
    next();
  } catch (err) {
    next(err);
  }
};

/** Require the authenticated user to hold one of the given roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'forbidden'));
      return;
    }
    next();
  };
}

export function isAdmin(req: { user?: { role: Role } }): boolean {
  return req.user?.role === 'PLATFORM_ADMIN';
}
