import { childLogger, metricsQueue, reconcileQueue } from '@idp/shared';

const log = childLogger('worker:scheduler');

/**
 * Register the periodic control loops:
 *  - reconcile-all every 30s (drift detection + self-heal sweep, ArgoCD-style)
 *  - scrape-all every 15s (observability sampling)
 * BullMQ dedupes repeatable jobs by their repeat options, so this is safe to
 * call on every worker start.
 */
export async function registerSchedulers(): Promise<void> {
  await reconcileQueue.add('reconcile-all', {}, { repeat: { every: 30_000 } });
  await metricsQueue.add('scrape-all', {}, { repeat: { every: 15_000 } });
  log.info('registered repeatable jobs: reconcile-all (30s), scrape-all (15s)');
}
