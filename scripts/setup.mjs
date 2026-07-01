#!/usr/bin/env node
/**
 * One-command bootstrap for the Internal Developer Platform.
 *
 *   1. checks prerequisites (docker running, kind, kubectl)
 *   2. brings up Postgres + Redis via docker compose
 *   3. creates a local image registry wired into the kind network
 *   4. creates the kind cluster (idempotent)
 *   5. installs ingress-nginx + metrics-server
 *   6. runs Prisma generate + migrate + seed
 *
 * Safe to re-run: every step is idempotent.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config (overridable via .env / environment) ──
const CLUSTER = process.env.KIND_CLUSTER_NAME || 'idp';
const KUBE_CONTEXT = `kind-${CLUSTER}`;
const REG_NAME = 'kind-registry';
const REG_PORT = '5001';
const INGRESS_VERSION = 'controller-v1.11.3';
const INGRESS_URL = `https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_VERSION}/deploy/static/provider/kind/deploy.yaml`;
const METRICS_URL =
  'https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml';

const TMP = join(tmpdir(), 'idp-setup');
mkdirSync(TMP, { recursive: true });

// ── Logging helpers ──
const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
const fail = (msg) => console.error(`\x1b[31m✗ ${msg}\x1b[0m`);

// ── Process helpers ──
function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, cwd: ROOT, ...opts });
}
function tryRun(cmd, opts = {}) {
  return spawnSync(cmd, { stdio: 'inherit', shell: true, cwd: ROOT, ...opts }).status === 0;
}
function capture(cmd, opts = {}) {
  try {
    return execSync(cmd, { shell: true, cwd: ROOT, ...opts }).toString().trim();
  } catch {
    return '';
  }
}
function has(bin) {
  return capture(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`) !== '';
}

// ── Load root .env into process.env so child processes (prisma) inherit it ──
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) {
    copyFileSync(join(ROOT, '.env.example'), envPath);
    ok('created .env from .env.example');
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ─────────────────────────── Steps ────────────────────────────

function checkPrereqs() {
  log('Checking prerequisites…');
  const missing = [];
  if (!has('docker')) missing.push('docker');
  if (!has('kubectl')) missing.push('kubectl');
  if (!has('kind')) missing.push('kind');
  if (missing.length) {
    fail(`Missing required tools: ${missing.join(', ')}`);
    if (missing.includes('kind')) {
      console.log('\nInstall kind:');
      console.log('  Windows:  scoop install kind   |   choco install kind');
      console.log('  or download: https://kind.sigs.k8s.io/docs/user/quick-start/#installation');
    }
    process.exit(1);
  }
  if (!tryRun('docker info', { stdio: 'ignore' })) {
    fail('Docker is installed but not running. Start Docker Desktop and re-run `npm run setup`.');
    process.exit(1);
  }
  ok('docker, kubectl, kind present and Docker is running');
}

function startInfra() {
  log('Starting Postgres + Redis (docker compose)…');
  // --wait blocks until both containers report healthy, so Prisma won't race.
  if (!tryRun('docker compose up -d --wait')) {
    run('docker compose up -d');
  }
  ok('Postgres + Redis up');
}

function createRegistry() {
  log('Ensuring local image registry…');
  const running = capture(`docker inspect -f "{{.State.Running}}" ${REG_NAME}`);
  if (running !== 'true') {
    run(
      `docker run -d --restart=always -p "127.0.0.1:${REG_PORT}:5000" --network bridge --name ${REG_NAME} registry:2`,
    );
    ok(`registry container ${REG_NAME} created on :${REG_PORT}`);
  } else {
    ok('registry already running');
  }
}

function createCluster() {
  log('Ensuring kind cluster…');
  const clusters = capture('kind get clusters').split('\n');
  if (clusters.includes(CLUSTER)) {
    ok(`cluster "${CLUSTER}" already exists`);
  } else {
    run(`kind create cluster --name ${CLUSTER} --config scripts/kind-config.yaml`);
    ok(`cluster "${CLUSTER}" created`);
  }
  run(`kubectl config use-context ${KUBE_CONTEXT}`);
}

function wireRegistry() {
  log('Wiring registry into the cluster…');
  // hosts.toml on every node so containerd mirrors localhost:5001 -> kind-registry:5000
  const hostsToml = `[host."http://${REG_NAME}:5000"]\n`;
  const hostsFile = join(TMP, 'hosts.toml');
  writeFileSync(hostsFile, hostsToml);
  const nodes = capture(`kind get nodes --name ${CLUSTER}`).split('\n').filter(Boolean);
  const regDir = `/etc/containerd/certs.d/localhost:${REG_PORT}`;
  for (const node of nodes) {
    run(`docker exec ${node} mkdir -p "${regDir}"`);
    run(`docker cp "${hostsFile}" ${node}:${regDir}/hosts.toml`);
  }
  // Connect the registry to the kind docker network (ignore if already connected).
  const net = capture(`docker inspect -f "{{json .NetworkSettings.Networks.kind}}" ${REG_NAME}`);
  if (net === 'null' || net === '') {
    tryRun(`docker network connect kind ${REG_NAME}`);
  }
  // Document the registry for tooling.
  const cmFile = join(TMP, 'local-registry-hosting.yaml');
  writeFileSync(
    cmFile,
    `apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REG_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
`,
  );
  run(`kubectl apply -f "${cmFile}"`);
  ok('registry wired (localhost:5001 pullable inside the cluster)');
}

function installIngress() {
  log('Installing ingress-nginx…');
  run(`kubectl apply -f ${INGRESS_URL}`);
  log('Waiting for ingress-nginx controller to be ready…');
  tryRun(
    'kubectl wait --namespace ingress-nginx --for=condition=ready pod ' +
      '--selector=app.kubernetes.io/component=controller --timeout=180s',
  );
  ok('ingress-nginx ready');
}

function installMetricsServer() {
  log('Installing metrics-server…');
  run(`kubectl apply -f ${METRICS_URL}`);
  // kind kubelets use self-signed certs; metrics-server must skip TLS verify.
  const patchFile = join(TMP, 'metrics-patch.json');
  writeFileSync(
    patchFile,
    JSON.stringify([
      { op: 'add', path: '/spec/template/spec/containers/0/args/-', value: '--kubelet-insecure-tls' },
    ]),
  );
  tryRun(
    `kubectl patch -n kube-system deployment metrics-server --type=json --patch-file "${patchFile}"`,
  );
  ok('metrics-server installed (kubelet-insecure-tls)');
}

function setupDatabase() {
  log('Setting up the database (generate + migrate + seed)…');
  const sharedCwd = join(ROOT, 'packages', 'shared');
  run('npx prisma generate', { cwd: sharedCwd });
  run('npx prisma migrate dev --name init --skip-seed', { cwd: sharedCwd });
  run('npx prisma db seed', { cwd: sharedCwd });
  ok('database migrated and seeded');
}

function summary() {
  console.log('\n\x1b[32m─────────────────────────────────────────────\x1b[0m');
  ok('IDP infrastructure is ready.');
  console.log('\nNext steps:');
  console.log('  npm run dev        # starts api, worker and portal');
  console.log('  Portal:  http://localhost:3000');
  console.log('  API:     http://localhost:4000');
  console.log('\nDemo logins:');
  console.log('  admin@idp.local / admin123   (platform-admin)');
  console.log('  dev@idp.local   / dev123      (developer)');
  console.log('\x1b[32m─────────────────────────────────────────────\x1b[0m\n');
}

async function main() {
  loadEnv();
  checkPrereqs();
  startInfra();
  createRegistry();
  createCluster();
  wireRegistry();
  installIngress();
  installMetricsServer();
  setupDatabase();
  summary();
}

main().catch((err) => {
  fail(err.message || String(err));
  process.exit(1);
});
