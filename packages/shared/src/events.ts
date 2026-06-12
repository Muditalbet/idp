import { createRedis, redis } from './redis';
import type {
  ClaimStatus,
  DeploymentStatus,
  HealthStatus,
  PipelineStatus,
  PipelineStep,
  SyncStatus,
} from './generated/prisma';

/**
 * Single Redis pub/sub channel carrying every real-time platform event.
 * Workers publish; the API's Socket.io gateway subscribes once and fans out
 * to the appropriate rooms (per-service and a global platform room).
 */
export const EVENTS_CHANNEL = 'idp:events';

interface BaseEvent {
  serviceId: string;
  serviceSlug?: string;
  environmentId?: string;
  ts: string;
}

export type IdpEvent =
  | (BaseEvent & {
      type: 'claim.status';
      claimId: string;
      status: ClaimStatus;
      message?: string;
      resources?: unknown;
    })
  | (BaseEvent & {
      type: 'pipeline.status';
      runId: string;
      status: PipelineStatus;
      step?: PipelineStep;
      image?: string;
      commitSha?: string;
    })
  | (BaseEvent & {
      type: 'pipeline.log';
      runId: string;
      step: PipelineStep;
      level: 'info' | 'warn' | 'error';
      message: string;
    })
  | (BaseEvent & {
      type: 'reconcile.status';
      syncStatus: SyncStatus;
      healthStatus: HealthStatus;
      message?: string;
    })
  | (BaseEvent & {
      type: 'deployment.status';
      deploymentId: string;
      status: DeploymentStatus;
      image: string;
    })
  | (BaseEvent & {
      type: 'metrics.sample';
      samples: { name: string; value: number; ts: string }[];
    })
  | (BaseEvent & {
      type: 'pod.log';
      pod: string;
      level: 'info' | 'warn' | 'error';
      message: string;
    });

export type IdpEventType = IdpEvent['type'];

/** Publish a platform event to all subscribers (the API gateway). */
export async function publishEvent(event: IdpEvent): Promise<void> {
  await redis.publish(EVENTS_CHANNEL, JSON.stringify(event));
}

/**
 * Subscribe to the platform event stream on a dedicated connection.
 * Returns an unsubscribe function.
 */
export function subscribeEvents(handler: (event: IdpEvent) => void): () => Promise<void> {
  const sub = createRedis();
  void sub.subscribe(EVENTS_CHANNEL);
  const onMessage = (_channel: string, message: string) => {
    try {
      handler(JSON.parse(message) as IdpEvent);
    } catch {
      // ignore malformed payloads
    }
  };
  sub.on('message', onMessage);
  return async () => {
    sub.off('message', onMessage);
    await sub.quit();
  };
}

/** Socket.io room name for a given service. */
export function serviceRoom(serviceId: string): string {
  return `service:${serviceId}`;
}

/** Global room every authenticated client joins for platform-wide events. */
export const PLATFORM_ROOM = 'platform';
