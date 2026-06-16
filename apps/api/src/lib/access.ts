import type { Request } from 'express';
import { prisma, type Prisma } from '@idp/shared';
import { HttpError } from '../middleware/error';

function assertCanAccessTeam(req: Request, teamId: string): void {
  const user = req.user;
  if (!user) throw new HttpError(401, 'unauthorized');
  if (user.role === 'PLATFORM_ADMIN') return;
  if (user.teamId !== teamId) throw new HttpError(403, 'forbidden');
}

/** Load a service and enforce that the caller may access it. */
export async function getServiceForUser<T extends Prisma.ServiceInclude>(
  req: Request,
  id: string,
  include?: T,
) {
  const service = await prisma.service.findUnique({ where: { id }, include });
  if (!service) throw new HttpError(404, 'service_not_found');
  assertCanAccessTeam(req, service.teamId);
  return service;
}

/** Load an environment (+its service for RBAC) and enforce access. */
export async function getEnvironmentForUser(req: Request, id: string) {
  const environment = await prisma.environment.findUnique({
    where: { id },
    include: { service: true, claim: true, deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!environment) throw new HttpError(404, 'environment_not_found');
  assertCanAccessTeam(req, environment.service.teamId);
  return environment;
}

/** Where-clause that scopes a service list to what the caller may see. */
export function serviceScope(req: Request): Prisma.ServiceWhereInput {
  const user = req.user;
  if (!user) throw new HttpError(401, 'unauthorized');
  if (user.role === 'PLATFORM_ADMIN') return {};
  return { teamId: user.teamId ?? '__none__' };
}
