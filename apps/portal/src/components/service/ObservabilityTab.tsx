'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useEnvironmentMetrics } from '@/lib/hooks';
import { startPodLogs, stopPodLogs } from '@/lib/realtime';
import { MetricChart } from './MetricChart';
import { LogView } from '@/components/LogView';
import { Card, CardHeader } from '@/components/ui';
import type { Environment } from '@/lib/types';

const RANGES = ['15m', '30m', '1h', '6h'];

export function ObservabilityTab({
  env,
  podLogs,
}: {
  env: Environment;
  podLogs: { message: string; ts: string }[];
}) {
  const [range, setRange] = useState('30m');
  const { data } = useEnvironmentMetrics(env.id, range);

  useEffect(() => {
    startPodLogs(env.id);
    return () => stopPodLogs(env.id);
  }, [env.id]);

  const series = data?.series ?? {};
  const get = (name: string) => (series[name] ?? []).map((p) => ({ ts: p.ts, value: p.value }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              r === range ? 'bg-brand-600/20 text-brand-300' : 'text-slate-400 hover:bg-slate-800',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricChart title="Requests / sec" data={get('http_requests_per_sec')} color="#6366f1" />
        <MetricChart title="Avg latency" unit="ms" data={get('http_latency_ms')} color="#f59e0b" />
        <MetricChart title="CPU" unit="m" kind="area" data={get('cpu_millicores')} color="#22d3ee" />
        <MetricChart title="Memory" unit="MB" kind="area" data={get('memory_mb')} color="#a78bfa" />
      </div>

      <Card>
        <CardHeader title="Live pod logs" subtitle={env.namespace} />
        <div className="p-4">
          <LogView lines={podLogs} emptyText="Streaming pod logs… (deploy the service first)" />
        </div>
      </Card>
    </div>
  );
}
