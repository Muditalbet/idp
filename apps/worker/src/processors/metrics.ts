import { Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  bullConnection,
  childLogger,
  kube,
  namespaceFor,
  prisma,
  publishEvent,
  redis,
  workloadName,
  type Environment,
  type MetricsJob,
  type Prisma,
  type Service,
} from '@idp/shared';

const log = childLogger('worker:metrics');

type EnvWithService = Environment & { service: Service };

// ─── Prometheus / quantity parsing ───

function sumPromMetric(text: string, name: string): number {
  const re = new RegExp(`^${name}(\\{[^}]*\\})?\\s+([0-9eE.+-]+)\\s*$`);
  let sum = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    const m = line.match(re);
    if (m) sum += Number.parseFloat(m[2]!);
  }
  return sum;
}

function cpuToMillicores(q: string): number {
  if (q.endsWith('n')) return Number.parseFloat(q) / 1_000_000;
  if (q.endsWith('u')) return Number.parseFloat(q) / 1_000;
  if (q.endsWith('m')) return Number.parseFloat(q);
  return Number.parseFloat(q) * 1000;
}

function memToMB(q: string): number {
  const units: Record<string, number> = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    K: 1000 / (1024 * 1024),
    M: 1_000_000 / (1024 * 1024),
  };
  const m = q.match(/^([0-9.]+)([A-Za-z]*)$/);
  if (!m) return 0;
  const value = Number.parseFloat(m[1]!);
  const factor = units[m[2]!] ?? 1 / (1024 * 1024); // plain bytes
  return value * factor;
}

interface PodList {
  items: { metadata: { name: string }; status?: { phase?: string } }[];
}
interface PodMetricsList {
  items: { metadata: { name: string }; containers: { usage: { cpu: string; memory: string } }[] }[];
}
interface LiveDeployment {
  status?: { readyReplicas?: number };
}

async function scrapeEnvironment(env: EnvWithService): Promise<void> {
  const ns = namespaceFor(env.service.slug, env.name);
  const selector = `idp.dev/service=${env.service.slug},idp.dev/environment=${env.name}`;
  const port = env.service.containerPort;

  // Running pods for this environment.
  const podList = await kube
    .rawJson<PodList>(`/api/v1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(selector)}`)
    .catch(() => ({ items: [] }) as PodList);
  const runningPods = podList.items.filter((p) => p.status?.phase === 'Running');
  if (runningPods.length === 0) return;

  // ── App metrics via the pod-proxy /metrics endpoint ──
  let requests = 0;
  let durationSum = 0;
  let durationCount = 0;
  for (const pod of runningPods) {
    const text = await kube
      .raw(`/api/v1/namespaces/${ns}/pods/${pod.metadata.name}:${port}/proxy/metrics`)
      .catch(() => '');
    if (!text) continue;
    requests += sumPromMetric(text, 'http_requests_total');
    durationSum += sumPromMetric(text, 'http_request_duration_seconds_sum');
    durationCount += sumPromMetric(text, 'http_request_duration_seconds_count');
  }

  // Convert counters to rates using the previous scrape (cached in Redis).
  const now = Date.now();
  const prevRaw = await redis.get(`metrics:prev:${env.id}`);
  let rps = 0;
  let latencyMs = 0;
  if (prevRaw) {
    const prev = JSON.parse(prevRaw) as { requests: number; durationSum: number; durationCount: number; ts: number };
    const dt = (now - prev.ts) / 1000;
    if (dt > 0) rps = Math.max(0, (requests - prev.requests) / dt);
    const dCount = durationCount - prev.durationCount;
    const dSum = durationSum - prev.durationSum;
    if (dCount > 0) latencyMs = Math.max(0, (dSum / dCount) * 1000);
  }
  await redis.set(
    `metrics:prev:${env.id}`,
    JSON.stringify({ requests, durationSum, durationCount, ts: now }),
    'EX',
    600,
  );

  // ── CPU / memory via metrics.k8s.io ──
  let cpuMillicores = 0;
  let memoryMB = 0;
  const podMetrics = await kube
    .rawJson<PodMetricsList>(
      `/apis/metrics.k8s.io/v1beta1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(selector)}`,
    )
    .catch(() => ({ items: [] }) as PodMetricsList);
  for (const pm of podMetrics.items) {
    for (const c of pm.containers) {
      cpuMillicores += cpuToMillicores(c.usage.cpu);
      memoryMB += memToMB(c.usage.memory);
    }
  }

  // ── Ready replicas ──
  const dep = await kube
    .get<LiveDeployment>('deployment', workloadName(env.service.slug), ns)
    .catch(() => null);
  const replicasReady = dep?.status?.readyReplicas ?? 0;

  const samples = [
    { name: 'http_requests_per_sec', value: round(rps) },
    { name: 'http_latency_ms', value: round(latencyMs) },
    { name: 'cpu_millicores', value: round(cpuMillicores) },
    { name: 'memory_mb', value: round(memoryMB) },
    { name: 'replicas_ready', value: replicasReady },
  ];

  await prisma.metricSample.createMany({
    data: samples.map((s) => ({ environmentId: env.id, name: s.name, value: s.value })) as Prisma.MetricSampleCreateManyInput[],
  });

  const ts = new Date().toISOString();
  await publishEvent({
    type: 'metrics.sample',
    serviceId: env.serviceId,
    serviceSlug: env.service.slug,
    environmentId: env.id,
    samples: samples.map((s) => ({ name: s.name, value: s.value, ts })),
    ts,
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function scrapeAll(): Promise<void> {
  const envs = await prisma.environment.findMany({
    where: { claim: { status: 'PROVISIONED' }, desiredImage: { not: null } },
    include: { service: true },
  });
  for (const env of envs) {
    await scrapeEnvironment(env).catch((err) =>
      log.warn({ err, env: env.namespace }, 'scrape failed'),
    );
  }
}

export function createMetricsWorker(): Worker<MetricsJob> {
  return new Worker<MetricsJob>(
    QUEUE_NAMES.metrics,
    async (job) => {
      if (job.name === 'scrape-all') return scrapeAll();
      if (job.data.environmentId) {
        const env = await prisma.environment.findUnique({
          where: { id: job.data.environmentId },
          include: { service: true },
        });
        if (env) await scrapeEnvironment(env);
      }
    },
    { connection: bullConnection, concurrency: 2 },
  );
}
