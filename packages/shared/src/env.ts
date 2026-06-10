import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Walk up from the current working directory to find the monorepo root `.env`.
 * Each app/worker runs from its own package dir, so we resolve the shared file.
 */
function findEnvFile(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile(process.cwd());
if (envPath) {
  loadDotenv({ path: envPath });
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('dev-only-change-me'),
  API_PORT: z.coerce.number().default(4000),
  PORTAL_PORT: z.coerce.number().default(3000),
  REGISTRY: z.string().default('localhost:5001'),
  // Inside the cluster the registry is reached as kind-registry:5000.
  REGISTRY_INTERNAL: z.string().default('kind-registry:5000'),
  INGRESS_DOMAIN: z.string().default('127.0.0.1.nip.io'),
  GITHUB_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  KUBE_CONTEXT: z.string().default('kind-idp'),
  KIND_CLUSTER_NAME: z.string().default('idp'),
  IDP_WORKSPACE_DIR: z.string().default('.idp-workspace'),
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
