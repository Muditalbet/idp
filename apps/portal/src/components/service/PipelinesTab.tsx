'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { usePipeline, useServicePipelines } from '@/lib/hooks';
import { LogView, type LogLine } from '@/components/LogView';
import { Card, CardHeader, Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/format';

export function PipelinesTab({
  serviceId,
  liveLogs,
}: {
  serviceId: string;
  liveLogs: Record<string, LogLine[]>;
}) {
  const { data: runs, isLoading } = useServicePipelines(serviceId);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedId = selected ?? runs?.[0]?.id ?? null;
  const { data: run } = usePipeline(selectedId ?? undefined);

  const selectedRun = runs?.find((r) => r.id === selectedId);
  const active = selectedRun?.status === 'RUNNING' || selectedRun?.status === 'QUEUED';
  const lines: LogLine[] = active
    ? (liveLogs[selectedId!] ?? [])
    : (run?.logs ?? liveLogs[selectedId ?? ''] ?? []);

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <Card>
        <CardHeader title="Pipeline runs" />
        <div className="max-h-[28rem] divide-y divide-slate-800 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          ) : (runs ?? []).length === 0 ? (
            <p className="p-4 text-xs text-slate-500">No pipeline runs yet.</p>
          ) : (
            runs!.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={clsx(
                  'block w-full px-4 py-2.5 text-left transition-colors',
                  r.id === selectedId ? 'bg-slate-800/60' : 'hover:bg-slate-800/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-300">{r.commitSha ?? 'latest'}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {r.trigger.toLowerCase()} · {relativeTime(r.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Build &amp; deploy logs"
          subtitle={selectedRun?.image ?? undefined}
          action={selectedRun ? <StatusBadge status={selectedRun.status} /> : undefined}
        />
        <div className="p-4">
          <LogView lines={lines} emptyText="Select a run, or hit Deploy to start one." />
        </div>
      </Card>
    </div>
  );
}
