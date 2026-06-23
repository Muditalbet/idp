import { Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  buildWorkloadManifests,
  bullConnection,
  childLogger,
  kube,
  namespaceFor,
  prisma,
  publishEvent,
  reconcileQueue,
  workloadName,
  type Environment,
  type HealthStatus,
  type Prisma,
  type ReconcileJob,
  type Service,
  type SyncStatus,
} from '@idp/shared';

const log = childLogger('worker:reconciler');

type EnvWithService = Environment & { service: Service };

interface LiveDeployment {
  spec?: { replicas?: number; template?: { spec?: { containers?: { image?: string }[] } } };
  status?: {
    readyReplicas?: number;
    availableReplicas?: number;
    conditions?: { type: string; status: string; reason?: string }[];
  };
}

function imageOf(live: LiveDeployment | null): string | undefined {
  return live?.spec?.template?.spec?.containers?.[0]?.image;
}

/** Derive ArgoCD-style health from a live Deployment's status. */
function computeHealth(live: LiveDeployment | null, desiredReplicas: number): HealthStatus {
  if (!live) return 'MISSING';
  if (desiredReplicas === 0) return 'HEALTHY';
  const ready = live.status?.readyReplicas ?? 0;
  if (ready >= desiredReplicas) return 'HEALTHY';
  const progressing = live.status?.conditions?.find((c) => c.type === 'Progressing');
  const available = live.status?.conditions?.find((c) => c.type === 'Available');
  if (progressing?.reason === 'ProgressDeadlineExceeded') return 'DEGRADED';
  if (ready === 0 && available?.status === 'False') return 'DEGRADED';
  return 'PROGRESSING';
}

async function updateState(
  env: EnvWithService,
  sync: SyncStatus,
  health: HealthStatus,
  manifest: object[] | null,
  message: string,
): Promise<void> {
  await prisma.environment.update({
    where: { id: env.id },
    data: {
      syncStatus: sync,
      healthStatus: health,
      lastReconciledAt: new Date(),
      reconcileError: health === 'DEGRADED' ? message : null,
      ...(manifest ? { desiredManifest: manifest as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  await publishEvent({
    type: 'reconcile.status',
    serviceId: env.serviceId,
    serviceSlug: env.service.slug,
    environmentId: env.id,
    syncStatus: sync,
    healthStatus: health,
    message,
    ts: new Date().toISOString(),
  });
}

/** When the desired image becomes healthy, complete its Deployment record. */
async function completeDeployment(
  env: EnvWithService,
  image: string,
  health: HealthStatus,
): Promise<void> {
  if (health !== 'HEALTHY') return;
  const current = await prisma.deployment.findFirst({
    where: { environmentId: env.id, image },
    orderBy: { createdAt: 'desc' },
  });
  if (!current || current.status === 'DEPLOYED') return;

  await prisma.deployment.update({ where: { id: current.id }, data: { status: 'DEPLOYED' } });
  await prisma.deployment.updateMany({
    where: { environmentId: env.id, status: 'DEPLOYED', id: { not: current.id } },
    data: { status: 'SUPERSEDED' },
  });
  await publishEvent({
    type: 'deployment.status',
    serviceId: env.serviceId,
    serviceSlug: env.service.slug,
    environmentId: env.id,
    deploymentId: current.id,
    status: 'DEPLOYED',
    image,
    ts: new Date().toISOString(),
  });
}

/**
 * Reconcile a single environment: detect drift against desired state, apply to
 * self-heal, then refresh sync + health — the core GitOps loop.
 */
async function reconcileOne(environmentId: string): Promise<void> {
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    include: { service: true, claim: true },
  });
  if (!env) return;
  if (!env.claim || env.claim.status !== 'PROVISIONED') return; // namespace not ready yet

  const ns = namespaceFor(env.service.slug, env.name);
  const name = workloadName(env.service.slug);

  // Nothing to run until the first image has been built.
  if (!env.desiredImage) {
    await updateState(env, 'UNKNOWN', 'MISSING', null, 'Awaiting first deploy');
    return;
  }

  const manifests = buildWorkloadManifests({
    serviceSlug: env.service.slug,
    envName: env.name,
    image: env.desiredImage,
    replicas: env.replicas,
    containerPort: env.service.containerPort,
  });

  // 1) Observe live state and diff against desired (drift detection).
  const liveBefore = await kube.get<LiveDeployment>('deployment', name, ns).catch(() => null);
  const drift: string[] = [];
  if (!liveBefore) drift.push('deployment missing');
  else {
    if (imageOf(liveBefore) !== env.desiredImage) drift.push('image');
    if ((liveBefore.spec?.replicas ?? -1) !== env.replicas) drift.push('replicas');
  }
  const [svc, ing] = await Promise.all([
    kube.get('service', name, ns).catch(() => null),
    kube.get('ingress', name, ns).catch(() => null),
  ]);
  if (!svc) drift.push('service missing');
  if (!ing) drift.push('ingress missing');

  const wasOutOfSync = drift.length > 0;
  if (wasOutOfSync) {
    log.info({ ns, drift }, 'drift detected — self-healing');
    await updateState(
      env,
      'OUT_OF_SYNC',
      computeHealth(liveBefore, env.replicas),
      manifests,
      `Drift: ${drift.join(', ')}`,
    );
  }

  // 2) Server-side apply desired state — heals any drift.
  await kube.apply(manifests);

  // 3) Refresh health and mark synced.
  const liveAfter = await kube.get<LiveDeployment>('deployment', name, ns).catch(() => null);
  const health = computeHealth(liveAfter, env.replicas);
  await updateState(
    env,
    'SYNCED',
    health,
    manifests,
    wasOutOfSync ? `Self-healed: ${drift.join(', ')}` : 'In sync',
  );

  await completeDeployment(env, env.desiredImage, health);
}

/** Enqueue a reconcile for every provisioned environment (periodic drift sweep). */
async function reconcileAll(): Promise<void> {
  const envs = await prisma.environment.findMany({
    where: { claim: { status: 'PROVISIONED' } },
    select: { id: true },
  });
  for (const e of envs) {
    await reconcileQueue.add('reconcile', { environmentId: e.id, reason: 'periodic' });
  }
}

export function createReconciler(): Worker<ReconcileJob> {
  return new Worker<ReconcileJob>(
    QUEUE_NAMES.reconcile,
    async (job) => {
      if (job.name === 'reconcile-all') return reconcileAll();
      if (job.data.environmentId) return reconcileOne(job.data.environmentId);
    },
    { connection: bullConnection, concurrency: 3 },
  );
}
