import { logger } from '@idp/shared';
import type { Worker } from 'bullmq';
import { createProvisioner } from './processors/provisioner';
import { createReconciler } from './processors/reconciler';
import { createPipelineWorker } from './processors/pipeline';
import { createMetricsWorker } from './processors/metrics';
import { registerSchedulers } from './schedulers';

async function main() {
  const workers: Worker[] = [
    createProvisioner(),
    createReconciler(),
    createPipelineWorker(),
    createMetricsWorker(),
  ];

  for (const w of workers) {
    w.on('failed', (job, err) =>
      logger.error({ queue: w.name, jobId: job?.id, err: err.message }, 'job failed'),
    );
    w.on('error', (err) => logger.error({ queue: w.name, err: err.message }, 'worker error'));
  }

  await registerSchedulers();
  logger.info('🛠  IDP workers started: provisioner · reconciler · pipeline · metrics');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'workers shutting down');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start workers');
  process.exit(1);
});
