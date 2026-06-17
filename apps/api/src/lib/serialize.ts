import type {
  Claim,
  Deployment,
  Environment,
  PipelineLog,
  PipelineRun,
  Service,
  Team,
  User,
} from '@idp/shared';

type TeamLite = Pick<Team, 'id' | 'name' | 'slug'>;

export function publicUser(u: User & { team?: Team | null }) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    teamId: u.teamId,
    team: u.team ? serializeTeam(u.team) : undefined,
  };
}

export function serializeTeam(t: TeamLite) {
  return { id: t.id, name: t.name, slug: t.slug };
}

export function serializeDeployment(d: Deployment) {
  return {
    id: d.id,
    image: d.image,
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    status: d.status,
    pipelineRunId: d.pipelineRunId,
    createdAt: d.createdAt,
  };
}

type EnvironmentWith = Environment & {
  claim?: Claim | null;
  deployments?: Deployment[];
};

export function serializeEnvironment(e: EnvironmentWith) {
  const latest = e.deployments && e.deployments.length > 0 ? e.deployments[0] : undefined;
  return {
    id: e.id,
    serviceId: e.serviceId,
    name: e.name,
    namespace: e.namespace,
    host: e.host,
    url: `http://${e.host}`,
    replicas: e.replicas,
    desiredImage: e.desiredImage,
    syncStatus: e.syncStatus,
    healthStatus: e.healthStatus,
    lastReconciledAt: e.lastReconciledAt,
    reconcileError: e.reconcileError,
    claim: e.claim
      ? { id: e.claim.id, status: e.claim.status, message: e.claim.message, resources: e.claim.resources }
      : undefined,
    latestDeployment: latest ? serializeDeployment(latest) : undefined,
    createdAt: e.createdAt,
  };
}

type ServiceWith = Service & {
  team?: Team | null;
  owner?: User | null;
  environments?: EnvironmentWith[];
};

export function serializeService(s: ServiceWith) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    repoUrl: s.repoUrl,
    defaultBranch: s.defaultBranch,
    template: s.template,
    containerPort: s.containerPort,
    teamId: s.teamId,
    team: s.team ? serializeTeam(s.team) : undefined,
    owner: s.owner ? { id: s.owner.id, name: s.owner.name, email: s.owner.email } : undefined,
    environments: s.environments ? s.environments.map(serializeEnvironment) : [],
    createdAt: s.createdAt,
  };
}

type PipelineRunWith = PipelineRun & { logs?: PipelineLog[] };

export function serializePipelineRun(r: PipelineRunWith) {
  return {
    id: r.id,
    serviceId: r.serviceId,
    environmentId: r.environmentId,
    trigger: r.trigger,
    status: r.status,
    commitSha: r.commitSha,
    commitMessage: r.commitMessage,
    image: r.image,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    createdAt: r.createdAt,
    logs: r.logs
      ? r.logs.map((l) => ({ step: l.step, level: l.level, message: l.message, ts: l.ts }))
      : undefined,
  };
}
