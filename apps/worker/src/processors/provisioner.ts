import { Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  buildInfraManifests,
  bullConnection,
  childLogger,
  kube,
  namespaceFor,
  prisma,
  publishEvent,
  reconcileQueue,
  type ClaimStatus,
  type Environment,
  type ProvisionJob,
  type Service,
} from '@idp/shared';

const log = childLogger('worker:provisioner');

type EnvWithService = Environment & { service: Service };

async function setClaim(
  env: EnvWithService,
  status: ClaimStatus,
  message: string,
  resources?: unknown,
): Promise<void> {
  const claim = await prisma.claim.upsert({
    where: { environmentId: env.id },
    update: { status, message, ...(resources ? { resources: resources as object } : {}) },
    create: { environmentId: env.id, status, message },
  });
  await publishEvent({
    type: 'claim.status',
    serviceId: env.serviceId,
    serviceSlug: env.service.slug,
    environmentId: env.id,
    claimId: claim.id,
    status,
    message,
    resources,
    ts: new Date().toISOString(),
  });
}

/** Fulfil an infra claim: namespace + quota + limits + network policy + SA. */
async function provision({ environmentId }: ProvisionJob): Promise<void> {
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    include: { service: true },
  });
  if (!env) {
    log.warn({ environmentId }, 'environment gone, skipping provision');
    return;
  }

  const spec = {
    serviceSlug: env.service.slug,
    envName: env.name,
    containerPort: env.service.containerPort,
  };
  try {
    await setClaim(env, 'PROVISIONING', 'Provisioning namespace, quota and policies…');

    const manifests = buildInfraManifests(spec);
    await kube.apply(manifests);

    const resources = manifests.map((m) => ({
      kind: m.kind,
      name: m.metadata.name,
      namespace: (m.metadata.namespace as string) ?? null,
    }));
    await setClaim(env, 'PROVISIONED', 'Namespace and policies ready', resources);
    log.info({ namespace: namespaceFor(env.service.slug, env.name) }, 'provisioned environment');

    // If we already know a desired image (re-provision), kick a reconcile.
    if (env.desiredImage) {
      await reconcileQueue.add('reconcile', { environmentId, reason: 'post-provision' });
    }
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err, environmentId }, 'provision failed');
    await setClaim(env, 'FAILED', message).catch(() => undefined);
    throw err;
  }
}

/** Tear down an environment: delete its namespace (cascades all resources). */
async function deprovision({ environmentId }: ProvisionJob): Promise<void> {
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    include: { service: true },
  });
  if (!env) return;

  const namespace = namespaceFor(env.service.slug, env.name);
  try {
    await kube.delete('namespace', namespace);
  } catch (err) {
    log.warn({ err, namespace }, 'namespace delete failed (continuing)');
  }

  await prisma.environment.delete({ where: { id: environmentId } }).catch(() => undefined);
  const remaining = await prisma.environment.count({ where: { serviceId: env.serviceId } });
  if (remaining === 0) {
    await prisma.service.delete({ where: { id: env.serviceId } }).catch(() => undefined);
  }
  log.info({ namespace }, 'deprovisioned environment');
}

export function createProvisioner(): Worker<ProvisionJob> {
  return new Worker<ProvisionJob>(
    QUEUE_NAMES.provision,
    async (job) => {
      if (job.name === 'deprovision') return deprovision(job.data);
      return provision(job.data);
    },
    { connection: bullConnection, concurrency: 4 },
  );
}
