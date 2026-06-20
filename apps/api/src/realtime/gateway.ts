import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  PLATFORM_ROOM,
  kube,
  logger,
  namespaceFor,
  prisma,
  serviceRoom,
  subscribeEvents,
  type IdpEvent,
  type Role,
} from '@idp/shared';
import { config } from '../config';
import { verifyToken } from '../auth/jwt';

interface SocketUser {
  id: string;
  email: string;
  role: Role;
  teamId: string | null;
}

function tokenFromHandshake(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: string } | undefined;
  if (auth?.token) return auth.token;
  const header = socket.handshake.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/**
 * Socket.io gateway. Authenticates the handshake with the same JWT as the REST
 * API, then bridges the Redis event bus to per-service rooms so the portal gets
 * live provisioning / pipeline / reconcile / metrics updates.
 */
export function createGateway(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.portalOrigin, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = tokenFromHandshake(socket);
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
      } satisfies SocketUser;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;

    socket.on('subscribe:service', async (serviceId: string, ack?: (ok: boolean) => void) => {
      const allowed = await canAccessService(user, serviceId);
      if (allowed) {
        await socket.join(serviceRoom(serviceId));
        ack?.(true);
      } else {
        ack?.(false);
      }
    });

    socket.on('unsubscribe:service', (serviceId: string) => {
      void socket.leave(serviceRoom(serviceId));
    });

    socket.on('subscribe:platform', (ack?: (ok: boolean) => void) => {
      if (user.role === 'PLATFORM_ADMIN') {
        void socket.join(PLATFORM_ROOM);
        ack?.(true);
      } else {
        ack?.(false);
      }
    });

    // On-demand live pod log tailing for an environment.
    const logStreams = new Map<string, { stop: () => void }>();

    socket.on('logs:start', async (environmentId: string, ack?: (ok: boolean) => void) => {
      if (logStreams.has(environmentId)) return ack?.(true);
      const env = await prisma.environment.findUnique({
        where: { id: environmentId },
        include: { service: true },
      });
      if (!env || !(await canAccessService(user, env.serviceId))) return ack?.(false);

      const ns = namespaceFor(env.service.slug, env.name);
      const selector = `idp.dev/service=${env.service.slug},idp.dev/environment=${env.name}`;
      const handle = kube.streamLogs(ns, selector, { tailLines: 80 }, (line) => {
        socket.emit('pod.log', {
          environmentId,
          serviceId: env.serviceId,
          message: line,
          ts: new Date().toISOString(),
        });
      });
      logStreams.set(environmentId, handle);
      ack?.(true);
    });

    socket.on('logs:stop', (environmentId: string) => {
      logStreams.get(environmentId)?.stop();
      logStreams.delete(environmentId);
    });

    socket.on('disconnect', () => {
      for (const handle of logStreams.values()) handle.stop();
      logStreams.clear();
    });
  });

  // Bridge Redis pub/sub -> socket rooms. Chaining rooms in a single emit means
  // a socket in both the service room and the platform room receives once.
  subscribeEvents((event: IdpEvent) => {
    io.to(serviceRoom(event.serviceId)).to(PLATFORM_ROOM).emit('event', event);
  });

  logger.info('socket.io gateway ready');
  return io;
}

async function canAccessService(user: SocketUser, serviceId: string): Promise<boolean> {
  if (user.role === 'PLATFORM_ADMIN') return true;
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { teamId: true },
  });
  return !!svc && svc.teamId === user.teamId;
}
