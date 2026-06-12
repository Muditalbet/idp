import { Redis, type RedisOptions } from 'ioredis';
import { env } from './env';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its blocking connections.
 * We use the same options for all connections for consistency.
 */
export function createRedis(opts: RedisOptions = {}): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...opts,
  });
}

// Shared connection used for the pub/sub event bus and general commands.
const globalForRedis = globalThis as unknown as { redis?: Redis };
export const redis = globalForRedis.redis ?? createRedis();
if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

/**
 * Connection *options* for BullMQ. We hand BullMQ options (not an instance) so
 * it builds its own connection with its bundled ioredis — avoiding the
 * duplicate-ioredis type clash and the manual `maxRetriesPerRequest: null`.
 */
function parseBullConnection() {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
  };
}

export const bullConnection = parseBullConnection();
