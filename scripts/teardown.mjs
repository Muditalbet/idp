#!/usr/bin/env node
/**
 * Tear down everything `setup.mjs` created: kind cluster, local registry, and
 * the Postgres/Redis containers (with their volumes).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLUSTER = process.env.KIND_CLUSTER_NAME || 'idp';

const run = (cmd) => spawnSync(cmd, { stdio: 'inherit', shell: true, cwd: ROOT });

console.log('▸ Deleting kind cluster…');
run(`kind delete cluster --name ${CLUSTER}`);

console.log('▸ Removing local registry…');
run('docker rm -f kind-registry');

console.log('▸ Stopping Postgres + Redis (and volumes)…');
run('docker compose down -v');

console.log('✓ Teardown complete.');
