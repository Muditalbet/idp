/**
 * Synthetic in-memory database + a mock of the `@idp/shared` package.
 *
 * The API layer imports `prisma`, the BullMQ queues, `publishEvent`, `kube`,
 * `redis`, `env` and a few pure helpers from `@idp/shared`. Talking to real
 * Postgres / Redis / Kubernetes in a unit test is slow and flaky, so this file
 * provides a hand-rolled in-memory store that implements exactly the Prisma
 * query shapes the routes use, plus lightweight stubs for the queues and the
 * Kubernetes client.
 *
 * `setup.ts` wires this in via `vi.mock('@idp/shared', …)`, and every test file
 * calls `seedDatabase()` in a `beforeEach` to get a clean, credential-seeded DB.
 */
import { vi } from 'vitest';
import bcrypt from 'bcryptjs';
import pino from 'pino';

// ─────────────────────────── Known test credentials ───────────────────────────
// A "synthetic DB with creds": these accounts are seeded on every reset so tests
// can log in through the real /auth/login endpoint and drive protected routes.
export const CREDENTIALS = {
  admin: { email: 'admin@idp.local', password: 'admin123' }, // PLATFORM_ADMIN, team alpha
  dev: { email: 'dev@idp.local', password: 'dev123' }, //     DEVELOPER,      team alpha
  otherDev: { email: 'other@idp.local', password: 'other123' }, // DEVELOPER,  team beta
  teamless: { email: 'nomad@idp.local', password: 'nomad123' }, // DEVELOPER,  no team
} as const;

// ─────────────────────────────── Store tables ─────────────────────────────────
type Row = Record<string, any>;

interface Tables {
  user: Row[];
  team: Row[];
  service: Row[];
  environment: Row[];
  claim: Row[];
  deployment: Row[];
  pipelineRun: Row[];
  pipelineLog: Row[];
  metricSample: Row[];
  auditLog: Row[];
}

export const tables: Tables = {
  user: [],
  team: [],
  service: [],
  environment: [],
  claim: [],
  deployment: [],
  pipelineRun: [],
  pipelineLog: [],
  metricSample: [],
  auditLog: [],
};

let idCounter = 0;
const gen = (prefix: string): string => `${prefix}_${(++idCounter).toString().padStart(4, '0')}`;
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// ───────────────────────────── Query primitives ──────────────────────────────

/** Match a single row against a Prisma-style `where` clause (the subset we use). */
function matchWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !(cond.in as any[]).includes(value)) return false;
      if ('notIn' in cond && (cond.notIn as any[]).includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
      if ('gte' in cond && !(new Date(value) >= new Date(cond.gte))) return false;
      if ('lte' in cond && !(new Date(value) <= new Date(cond.lte))) return false;
      if ('gt' in cond && !(new Date(value) > new Date(cond.gt))) return false;
      if ('lt' in cond && !(new Date(value) < new Date(cond.lt))) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function applyOrderBy(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [key, dir] = Object.entries(orderBy)[0]!;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
}

// ───────────────────────────── Relation resolvers ─────────────────────────────
// Resolve one relation on `row`. `opts` is the sub-query (true | { include, select,
// orderBy, take, where }). Returns a hydrated related row / list / null.
function resolveRelation(model: string, row: Row, key: string, opts: any): any {
  const sub = opts === true ? {} : opts ?? {};
  const one = (m: string, r: Row | undefined) => (r ? hydrate(m, r, sub) : null);
  const many = (m: string, rs: Row[]) => {
    let out = rs.filter((r) => matchWhere(r, sub.where));
    out = applyOrderBy(out, sub.orderBy);
    if (typeof sub.skip === 'number') out = out.slice(sub.skip);
    if (typeof sub.take === 'number') out = out.slice(0, sub.take);
    return out.map((r) => hydrate(m, r, sub));
  };

  switch (`${model}.${key}`) {
    case 'user.team':
      return one('team', tables.team.find((t) => t.id === row.teamId));
    case 'user.services':
      return many('service', tables.service.filter((s) => s.ownerId === row.id));
    case 'team.users':
      return many('user', tables.user.filter((u) => u.teamId === row.id));
    case 'team.services':
      return many('service', tables.service.filter((s) => s.teamId === row.id));
    case 'service.team':
      return one('team', tables.team.find((t) => t.id === row.teamId));
    case 'service.owner':
      return one('user', tables.user.find((u) => u.id === row.ownerId));
    case 'service.environments':
      return many('environment', tables.environment.filter((e) => e.serviceId === row.id));
    case 'service.pipelineRuns':
      return many('pipelineRun', tables.pipelineRun.filter((p) => p.serviceId === row.id));
    case 'environment.service':
      return one('service', tables.service.find((s) => s.id === row.serviceId));
    case 'environment.claim':
      return one('claim', tables.claim.find((c) => c.environmentId === row.id));
    case 'environment.deployments':
      return many('deployment', tables.deployment.filter((d) => d.environmentId === row.id));
    case 'environment.metricSamples':
      return many('metricSample', tables.metricSample.filter((m) => m.environmentId === row.id));
    case 'environment.pipelineRuns':
      return many('pipelineRun', tables.pipelineRun.filter((p) => p.environmentId === row.id));
    case 'claim.environment':
      return one('environment', tables.environment.find((e) => e.id === row.environmentId));
    case 'deployment.environment':
      return one('environment', tables.environment.find((e) => e.id === row.environmentId));
    case 'pipelineRun.service':
      return one('service', tables.service.find((s) => s.id === row.serviceId));
    case 'pipelineRun.environment':
      return one('environment', tables.environment.find((e) => e.id === row.environmentId));
    case 'pipelineRun.logs':
      return many('pipelineLog', tables.pipelineLog.filter((l) => l.pipelineRunId === row.id));
    default:
      return null;
  }
}

/** Count relations for a Prisma `_count: { select: { … } }` include. */
function resolveCount(model: string, row: Row, select: Row): Row {
  const out: Row = {};
  for (const key of Object.keys(select)) {
    out[key] = (resolveRelation(model, row, key, true) as any[])?.length ?? 0;
  }
  return out;
}

/** Apply an include/select to a base row, returning a hydrated copy. */
function hydrate(model: string, row: Row, opts?: any): Row {
  if (opts?.select) {
    const out: Row = {};
    for (const [key, val] of Object.entries<any>(opts.select)) {
      if (val === true) out[key] = clone(row[key]);
      else if (key === '_count') out[key] = resolveCount(model, row, val.select);
      else out[key] = resolveRelation(model, row, key, val);
    }
    return out;
  }
  const out: Row = clone(row);
  if (opts?.include) {
    for (const [key, val] of Object.entries<any>(opts.include)) {
      if (key === '_count') out[key] = resolveCount(model, row, val.select);
      else out[key] = resolveRelation(model, row, key, val);
    }
  }
  return out;
}

// ─────────────────────────── Nested create support ────────────────────────────
// Applies model defaults + timestamps and handles the nested `create` blocks the
// service scaffolder uses (environments → claim).
const TS_MODELS: (keyof Tables)[] = ['pipelineLog', 'metricSample', 'auditLog'];

function insert(model: keyof Tables, data: Row): Row {
  const now = new Date().toISOString();
  const base: Row = {
    id: gen(model),
    createdAt: now,
    updatedAt: now,
    ...(TS_MODELS.includes(model) ? { ts: now } : {}),
    ...defaultsFor(model),
    ...scalarOnly(data),
  };
  tables[model].push(base);

  if (model === 'service' && data.environments?.create) {
    for (const envData of data.environments.create) {
      const env = insert('environment', { ...envData, serviceId: base.id });
      if (envData.claim?.create) {
        insert('claim', { ...envData.claim.create, environmentId: env.id });
      }
    }
  }
  return base;
}

function scalarOnly(data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'environments' || k === 'claim') continue; // handled as nested creates
    out[k] = v;
  }
  return out;
}

function defaultsFor(model: keyof Tables): Row {
  switch (model) {
    case 'user':
      return { role: 'DEVELOPER', teamId: null };
    case 'service':
      return { description: '', defaultBranch: 'main', template: 'node-service', containerPort: 8080 };
    case 'environment':
      return {
        desiredImage: null,
        replicas: 1,
        desiredManifest: null,
        syncStatus: 'UNKNOWN',
        healthStatus: 'UNKNOWN',
        lastReconciledAt: null,
        reconcileError: null,
      };
    case 'claim':
      return { status: 'PENDING', message: null, resources: null };
    case 'deployment':
      return { commitSha: null, commitMessage: null, status: 'PENDING', pipelineRunId: null };
    case 'pipelineRun':
      return {
        trigger: 'MANUAL',
        status: 'QUEUED',
        commitSha: null,
        commitMessage: null,
        image: null,
        triggeredById: null,
        startedAt: null,
        finishedAt: null,
      };
    case 'pipelineLog':
      return { level: 'info' };
    case 'auditLog':
      return { actorId: null, actorEmail: null, targetType: null, targetId: null, metadata: null };
    default:
      return {};
  }
}

// ─────────────────────── Prisma delegate factory ──────────────────────────────
function delegate(model: keyof Tables) {
  return {
    findUnique: async ({ where, include, select }: any = {}) => {
      const row = tables[model].find((r) => matchWhere(r, where));
      return row ? hydrate(model, row, { include, select }) : null;
    },
    findFirst: async ({ where, include, select, orderBy, skip }: any = {}) => {
      let rows = tables[model].filter((r) => matchWhere(r, where));
      rows = applyOrderBy(rows, orderBy);
      if (typeof skip === 'number') rows = rows.slice(skip);
      const row = rows[0];
      return row ? hydrate(model, row, { include, select }) : null;
    },
    findMany: async ({ where, include, select, orderBy, take, skip }: any = {}) => {
      let rows = tables[model].filter((r) => matchWhere(r, where));
      rows = applyOrderBy(rows, orderBy);
      if (typeof skip === 'number') rows = rows.slice(skip);
      if (typeof take === 'number') rows = rows.slice(0, take);
      return rows.map((r) => hydrate(model, r, { include, select }));
    },
    count: async ({ where }: any = {}) => tables[model].filter((r) => matchWhere(r, where)).length,
    create: async ({ data, include, select }: any) => {
      const row = insert(model, data);
      return hydrate(model, row, { include, select });
    },
    update: async ({ where, data }: any) => {
      const row = tables[model].find((r) => matchWhere(r, where));
      if (!row) throw new Error(`${model} not found for update`);
      Object.assign(row, scalarOnly(data), { updatedAt: new Date().toISOString() });
      return clone(row);
    },
    delete: async ({ where }: any) => {
      const idx = tables[model].findIndex((r) => matchWhere(r, where));
      if (idx === -1) throw new Error(`${model} not found for delete`);
      const [row] = tables[model].splice(idx, 1);
      return clone(row);
    },
    groupBy: async ({ by, _count }: any) => {
      const groups = new Map<string, number>();
      for (const r of tables[model]) {
        const key = by.map((b: string) => r[b]).join('|');
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      return [...groups.entries()].map(([key, n]) => {
        const out: Row = {};
        by.forEach((b: string, i: number) => (out[b] = key.split('|')[i]));
        if (_count?._all) out._count = { _all: n };
        return out;
      });
    },
  };
}

export const prisma: any = {
  user: delegate('user'),
  team: delegate('team'),
  service: delegate('service'),
  environment: delegate('environment'),
  claim: delegate('claim'),
  deployment: delegate('deployment'),
  pipelineRun: delegate('pipelineRun'),
  pipelineLog: delegate('pipelineLog'),
  metricSample: delegate('metricSample'),
  auditLog: delegate('auditLog'),
  $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  $disconnect: vi.fn(async () => undefined),
};

// ───────────────────────── Queue / infra stubs ────────────────────────────────
const makeQueue = () => ({ add: vi.fn(async () => ({ id: gen('job') })) });
export const provisionQueue = makeQueue();
export const pipelineQueue = makeQueue();
export const reconcileQueue = makeQueue();
export const metricsQueue = makeQueue();

export const publishEvent = vi.fn(async () => undefined);

export const kube = {
  list: vi.fn(async () => [
    {
      metadata: { name: 'idp-control-plane' },
      status: { conditions: [{ type: 'Ready', status: 'True' }], nodeInfo: { kubeletVersion: 'v1.31.0' } },
    },
  ]),
  get: vi.fn(async () => null),
  apply: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  ping: vi.fn(async () => true),
  raw: vi.fn(async () => ''),
  rawJson: vi.fn(async () => ({})),
};

export const redis = { ping: vi.fn(async () => 'PONG') };

// A real (silent) pino instance — pino-http reads logger.levels/child internally.
export const logger = pino({ level: 'silent' });
export const childLogger = () => logger;

// Mocked, validation-free environment (real env.ts never runs under the mock).
export const env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://synthetic',
  REDIS_URL: 'redis://synthetic',
  JWT_SECRET: 'test-jwt-secret',
  API_PORT: 4000,
  PORTAL_PORT: 3000,
  REGISTRY: 'localhost:5001',
  REGISTRY_INTERNAL: 'kind-registry:5000',
  INGRESS_DOMAIN: '127.0.0.1.nip.io',
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
  KUBE_CONTEXT: 'kind-idp',
  KIND_CLUSTER_NAME: 'idp',
  IDP_WORKSPACE_DIR: '.idp-workspace',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
};

// ─────────────────── Pure helpers re-implemented from names.ts ─────────────────
export function toDnsLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}
export const namespaceFor = (slug: string, envName: string) => toDnsLabel(`${slug}-${envName}`);
export const hostFor = (slug: string, envName: string) => `${namespaceFor(slug, envName)}.${env.INGRESS_DOMAIN}`;
export const workloadName = (slug: string) => toDnsLabel(slug);
export const imageRef = (slug: string, tag: string) => `${env.REGISTRY}/${toDnsLabel(slug)}:${tag}`;

// ─────────────────────── Seed / reset the synthetic DB ─────────────────────────
export interface SeedRefs {
  teams: { alpha: Row; beta: Row };
  users: { admin: Row; dev: Row; otherDev: Row; teamless: Row };
  services: { payments: Row; billing: Row }; // payments=team alpha, billing=team beta
  env: Row; // payments/dev environment
  claim: Row;
  deployments: { current: Row; previous: Row };
  pipelineRun: Row;
}

export let seeded: SeedRefs;

/** Reset every table and repopulate a small, realistic dataset. */
export async function seedDatabase(): Promise<SeedRefs> {
  for (const key of Object.keys(tables) as (keyof Tables)[]) tables[key].length = 0;
  idCounter = 0;
  vi.clearAllMocks();

  const hash = (pw: string) => bcrypt.hashSync(pw, 8);

  const alpha = insert('team', { name: 'Alpha', slug: 'alpha' });
  const beta = insert('team', { name: 'Beta', slug: 'beta' });

  const admin = insert('user', {
    email: CREDENTIALS.admin.email,
    name: 'Ada Admin',
    passwordHash: hash(CREDENTIALS.admin.password),
    role: 'PLATFORM_ADMIN',
    teamId: alpha.id,
  });
  const dev = insert('user', {
    email: CREDENTIALS.dev.email,
    name: 'Dev Eloper',
    passwordHash: hash(CREDENTIALS.dev.password),
    role: 'DEVELOPER',
    teamId: alpha.id,
  });
  const otherDev = insert('user', {
    email: CREDENTIALS.otherDev.email,
    name: 'Otto Other',
    passwordHash: hash(CREDENTIALS.otherDev.password),
    role: 'DEVELOPER',
    teamId: beta.id,
  });
  const teamless = insert('user', {
    email: CREDENTIALS.teamless.email,
    name: 'Nora Nomad',
    passwordHash: hash(CREDENTIALS.teamless.password),
    role: 'DEVELOPER',
    teamId: null,
  });

  // payments — owned by dev, team alpha, with a fully provisioned dev environment.
  const payments = insert('service', {
    name: 'Payments',
    slug: 'payments',
    description: 'Handles payments',
    repoUrl: 'https://github.com/acme/payments',
    defaultBranch: 'main',
    teamId: alpha.id,
    ownerId: dev.id,
  });
  const paymentsEnv = insert('environment', {
    serviceId: payments.id,
    name: 'dev',
    namespace: namespaceFor('payments', 'dev'),
    host: hostFor('payments', 'dev'),
    desiredImage: imageRef('payments', 'aaaa111'),
    replicas: 2,
    desiredManifest: [{ kind: 'Deployment', metadata: { name: 'payments' } }],
    syncStatus: 'SYNCED',
    healthStatus: 'HEALTHY',
    lastReconciledAt: new Date().toISOString(),
  });
  const claim = insert('claim', {
    environmentId: paymentsEnv.id,
    status: 'PROVISIONED',
    message: 'Namespace and policies ready',
    resources: [{ kind: 'Namespace', name: paymentsEnv.namespace }],
  });
  // Two prior deployments so /rollback has a default target (skip:1). Explicit,
  // distinct createdAt values make "order by createdAt desc" deterministic.
  const previous = insert('deployment', {
    environmentId: paymentsEnv.id,
    image: imageRef('payments', 'old0001'),
    commitSha: 'old0001',
    status: 'SUPERSEDED',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const current = insert('deployment', {
    environmentId: paymentsEnv.id,
    image: imageRef('payments', 'aaaa111'),
    commitSha: 'aaaa111',
    status: 'DEPLOYED',
    createdAt: new Date(Date.now() - 30_000).toISOString(),
  });
  const pipelineRun = insert('pipelineRun', {
    serviceId: payments.id,
    environmentId: paymentsEnv.id,
    trigger: 'MANUAL',
    status: 'SUCCESS',
    commitSha: 'aaaa111',
    image: imageRef('payments', 'aaaa111'),
    triggeredById: dev.id,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  insert('pipelineLog', { pipelineRunId: pipelineRun.id, step: 'CLONE', message: 'Cloning repo' });
  insert('pipelineLog', { pipelineRunId: pipelineRun.id, step: 'BUILD', message: 'Building image' });
  insert('metricSample', { environmentId: paymentsEnv.id, name: 'cpu_millicores', value: 120 });
  insert('metricSample', { environmentId: paymentsEnv.id, name: 'memory_mb', value: 256 });

  // billing — team beta (used to prove cross-team access is denied for alpha devs).
  const billing = insert('service', {
    name: 'Billing',
    slug: 'billing',
    repoUrl: 'https://github.com/acme/billing',
    teamId: beta.id,
    ownerId: otherDev.id,
  });

  insert('auditLog', { actorId: admin.id, actorEmail: admin.email, action: 'user.login' });

  seeded = {
    teams: { alpha, beta },
    users: { admin, dev, otherDev, teamless },
    services: { payments, billing },
    env: paymentsEnv,
    claim,
    deployments: { current, previous },
    pipelineRun,
  };
  return seeded;
}

// The object `vi.mock('@idp/shared')` returns — every runtime export the API uses.
export const mockShared = {
  prisma,
  provisionQueue,
  pipelineQueue,
  reconcileQueue,
  metricsQueue,
  publishEvent,
  kube,
  redis,
  logger,
  childLogger,
  env,
  toDnsLabel,
  namespaceFor,
  hostFor,
  workloadName,
  imageRef,
  QUEUE_NAMES: { provision: 'idp.provision', pipeline: 'idp.pipeline', reconcile: 'idp.reconcile', metrics: 'idp.metrics' },
};
