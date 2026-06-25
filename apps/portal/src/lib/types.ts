export type Role = 'DEVELOPER' | 'PLATFORM_ADMIN';
export type SyncStatus = 'UNKNOWN' | 'SYNCED' | 'OUT_OF_SYNC';
export type HealthStatus = 'UNKNOWN' | 'PROGRESSING' | 'HEALTHY' | 'DEGRADED' | 'MISSING';
export type ClaimStatus = 'PENDING' | 'PROVISIONING' | 'PROVISIONED' | 'FAILED';
export type DeploymentStatus =
  | 'PENDING'
  | 'DEPLOYING'
  | 'DEPLOYED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'SUPERSEDED';
export type PipelineStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
export type PipelineStep = 'QUEUE' | 'CLONE' | 'BUILD' | 'PUSH' | 'DEPLOY';
export type PipelineTrigger = 'MANUAL' | 'WEBHOOK' | 'ROLLBACK';

export interface Team {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  team?: Team;
}

export interface Deployment {
  id: string;
  image: string;
  commitSha: string | null;
  commitMessage: string | null;
  status: DeploymentStatus;
  pipelineRunId: string | null;
  createdAt: string;
}

export interface ClaimResource {
  kind: string;
  name: string;
  namespace: string | null;
}

export interface Environment {
  id: string;
  serviceId: string;
  name: string;
  namespace: string;
  host: string;
  url: string;
  replicas: number;
  desiredImage: string | null;
  syncStatus: SyncStatus;
  healthStatus: HealthStatus;
  lastReconciledAt: string | null;
  reconcileError: string | null;
  claim?: { id: string; status: ClaimStatus; message: string | null; resources: ClaimResource[] | null };
  latestDeployment?: Deployment;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoUrl: string;
  defaultBranch: string;
  template: string;
  containerPort: number;
  teamId: string;
  team?: Team;
  owner?: { id: string; name: string; email: string };
  environments: Environment[];
  createdAt: string;
}

export interface PipelineLogLine {
  step: PipelineStep;
  level: string;
  message: string;
  ts: string;
}

export interface PipelineRun {
  id: string;
  serviceId: string;
  environmentId: string;
  trigger: PipelineTrigger;
  status: PipelineStatus;
  commitSha: string | null;
  commitMessage: string | null;
  image: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  logs?: PipelineLogLine[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  language: string;
  defaultPort: number;
  tags: string[];
  exampleRepo: string;
}

export interface AuditLog {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ts: string;
}

export interface ClusterOverview {
  counts: { services: number; environments: number; deployments: number; pipelineRuns: number };
  health: Record<string, number>;
  cluster: { reachable: boolean; nodes: { name: string; ready: boolean; version: string }[] };
}

export interface MetricSeries {
  range: string;
  series: Record<string, { ts: string; value: number }[]>;
}

// Real-time event payloads (mirror of the API event bus).
export type IdpEvent =
  | { type: 'claim.status'; serviceId: string; environmentId?: string; claimId: string; status: ClaimStatus; message?: string; ts: string }
  | { type: 'pipeline.status'; serviceId: string; environmentId?: string; runId: string; status: PipelineStatus; image?: string; commitSha?: string; ts: string }
  | { type: 'pipeline.log'; serviceId: string; environmentId?: string; runId: string; step: PipelineStep; level: 'info' | 'warn' | 'error'; message: string; ts: string }
  | { type: 'reconcile.status'; serviceId: string; environmentId?: string; syncStatus: SyncStatus; healthStatus: HealthStatus; message?: string; ts: string }
  | { type: 'deployment.status'; serviceId: string; environmentId?: string; deploymentId: string; status: DeploymentStatus; image: string; ts: string }
  | { type: 'metrics.sample'; serviceId: string; environmentId?: string; samples: { name: string; value: number; ts: string }[]; ts: string };

export interface PodLogEvent {
  environmentId: string;
  serviceId: string;
  message: string;
  ts: string;
}
