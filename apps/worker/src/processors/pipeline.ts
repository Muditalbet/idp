import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cp, rm } from 'node:fs/promises';
import { Worker } from 'bullmq';
import { simpleGit } from 'simple-git';
import { findRepoRoot } from '../lib/paths';
import {
  QUEUE_NAMES,
  bullConnection,
  childLogger,
  imageRef,
  prisma,
  publishEvent,
  reconcileQueue,
  type PipelineJob,
  type PipelineStatus,
} from '@idp/shared';
import { execStream } from '../lib/exec';
import { pipelineLogger, type LogContext } from '../lib/pipeline-log';

const log = childLogger('worker:pipeline');

async function setStatus(
  runId: string,
  status: PipelineStatus,
  extra: { startedAt?: Date; finishedAt?: Date; image?: string } = {},
): Promise<void> {
  await prisma.pipelineRun.update({ where: { id: runId }, data: { status, ...extra } });
}

async function publishStatus(
  ctx: LogContext,
  status: PipelineStatus,
  extra: { image?: string; commitSha?: string } = {},
): Promise<void> {
  await publishEvent({
    type: 'pipeline.status',
    serviceId: ctx.serviceId,
    serviceSlug: ctx.serviceSlug,
    environmentId: ctx.environmentId,
    runId: ctx.runId,
    status,
    ...extra,
    ts: new Date().toISOString(),
  });
}

function isRemote(url: string): boolean {
  return /^(https?:\/\/|git@|git:\/\/|ssh:\/\/)/.test(url);
}

/**
 * Fetch source into `dir`, returning a commit SHA / build tag.
 *  - remote git URL  → shallow clone the branch HEAD
 *  - `bundled:<name>`→ copy the in-repo examples/<name> (zero-setup demo)
 *  - local path/file → copy the directory
 */
async function fetchSource(
  repoUrl: string,
  branch: string,
  dir: string,
  onLine: (l: string) => void,
): Promise<string> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);

  if (isRemote(repoUrl)) {
    onLine(`$ git clone --depth 1 --branch ${branch} ${repoUrl}`);
    await simpleGit().clone(repoUrl, dir, ['--depth', '1', '--branch', branch]);
    const sha = (await simpleGit(dir).revparse(['HEAD'])).trim();
    onLine(`Checked out ${sha.slice(0, 7)}`);
    return sha;
  }

  const src = repoUrl.startsWith('bundled:')
    ? join(findRepoRoot(), 'examples', repoUrl.slice('bundled:'.length))
    : repoUrl.replace(/^file:\/\//, '');
  onLine(`Copying local source from ${src}`);
  await cp(src, dir, { recursive: true });
  return `local-${Date.now().toString(36)}`;
}

/**
 * The CI/CD pipeline: clone → docker build → push to the local registry →
 * set desired image + create a Deployment → trigger a reconcile.
 * Every step streams logs to Postgres and the portal.
 */
async function runPipeline({ runId }: PipelineJob): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { service: true, environment: true },
  });
  if (!run) {
    log.warn({ runId }, 'pipeline run gone, skipping');
    return;
  }

  const { service, environment } = run;
  const ctx: LogContext = {
    runId: run.id,
    serviceId: service.id,
    serviceSlug: service.slug,
    environmentId: environment.id,
  };
  const logLine = pipelineLogger(ctx);
  const workDir = join(tmpdir(), 'idp-builds', `${service.slug}-${run.id}`);

  await setStatus(run.id, 'RUNNING', { startedAt: new Date() });
  await publishStatus(ctx, 'RUNNING');

  try {
    // ── CLONE ──
    await logLine('CLONE', `Fetching ${service.repoUrl} @ ${service.defaultBranch}`);
    const sha = await fetchSource(service.repoUrl, service.defaultBranch, workDir, (l) =>
      void logLine('CLONE', l),
    );
    const shortSha = sha.startsWith('local-') ? sha : sha.slice(0, 7);
    await prisma.pipelineRun.update({ where: { id: run.id }, data: { commitSha: shortSha } });

    // ── BUILD ──
    const image = imageRef(service.slug, shortSha);
    await logLine('BUILD', `Building image ${image}`);
    await execStream('docker', ['build', '-t', image, '.'], { cwd: workDir }, (l) =>
      void logLine('BUILD', l),
    );

    // ── PUSH ──
    await logLine('PUSH', `Pushing ${image} to the local registry`);
    await execStream('docker', ['push', image], {}, (l) => void logLine('PUSH', l));

    // ── DEPLOY (declare desired state, hand off to the reconciler) ──
    await logLine('DEPLOY', 'Recording desired image and triggering reconcile');
    const deployment = await prisma.deployment.create({
      data: {
        environmentId: environment.id,
        image,
        commitSha: shortSha,
        commitMessage: run.commitMessage,
        status: 'DEPLOYING',
        pipelineRunId: run.id,
      },
    });
    await prisma.environment.update({
      where: { id: environment.id },
      data: { desiredImage: image, syncStatus: 'OUT_OF_SYNC' },
    });
    await prisma.pipelineRun.update({ where: { id: run.id }, data: { image } });
    await publishEvent({
      type: 'deployment.status',
      serviceId: service.id,
      serviceSlug: service.slug,
      environmentId: environment.id,
      deploymentId: deployment.id,
      status: 'DEPLOYING',
      image,
      ts: new Date().toISOString(),
    });
    await reconcileQueue.add('reconcile', { environmentId: environment.id, reason: 'deploy' });

    await setStatus(run.id, 'SUCCESS', { finishedAt: new Date(), image });
    await publishStatus(ctx, 'SUCCESS', { image, commitSha: shortSha });
    await logLine('DEPLOY', `✅ Build pushed and reconcile triggered (${image})`);
    log.info({ image }, 'pipeline succeeded');
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err, runId }, 'pipeline failed');
    await logLine('BUILD', `❌ ${message}`, 'error');
    await setStatus(run.id, 'FAILED', { finishedAt: new Date() });
    await publishStatus(ctx, 'FAILED');
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createPipelineWorker(): Worker<PipelineJob> {
  return new Worker<PipelineJob>(QUEUE_NAMES.pipeline, (job) => runPipeline(job.data), {
    connection: bullConnection,
    concurrency: 2,
  });
}
