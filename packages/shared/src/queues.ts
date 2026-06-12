import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection } from './redis';

export const QUEUE_NAMES = {
  provision: 'idp.provision',
  pipeline: 'idp.pipeline',
  reconcile: 'idp.reconcile',
  metrics: 'idp.metrics',
} as const;

// ─── Job payloads ───
export interface ProvisionJob {
  environmentId: string;
  actorId?: string;
}
export interface PipelineJob {
  runId: string;
}
export interface ReconcileJob {
  // Reconcile a single environment, or all environments when omitted.
  environmentId?: string;
  reason?: string;
}
export interface MetricsJob {
  environmentId?: string;
}

const defaultJobOptions: JobsOptions = {
  attempts: 1,
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
};

export const provisionQueue = new Queue<ProvisionJob>(QUEUE_NAMES.provision, {
  connection: bullConnection,
  defaultJobOptions,
});

export const pipelineQueue = new Queue<PipelineJob>(QUEUE_NAMES.pipeline, {
  connection: bullConnection,
  defaultJobOptions,
});

export const reconcileQueue = new Queue<ReconcileJob>(QUEUE_NAMES.reconcile, {
  connection: bullConnection,
  defaultJobOptions: { ...defaultJobOptions, removeOnComplete: { count: 50 } },
});

export const metricsQueue = new Queue<MetricsJob>(QUEUE_NAMES.metrics, {
  connection: bullConnection,
  defaultJobOptions: { ...defaultJobOptions, removeOnComplete: { count: 20 } },
});
