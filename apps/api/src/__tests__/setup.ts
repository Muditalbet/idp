/**
 * Global test setup: replace `@idp/shared` with the synthetic in-memory store
 * (see helpers/synthetic-db.ts) so the API can be exercised end-to-end without
 * Postgres, Redis or a Kubernetes cluster. Registered once here and applied to
 * every test file via vitest's `setupFiles`.
 */
import { vi } from 'vitest';

vi.mock('@idp/shared', async () => {
  const mod = await import('./helpers/synthetic-db');
  return mod.mockShared;
});
