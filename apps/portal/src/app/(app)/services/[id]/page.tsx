'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useService } from '@/lib/hooks';
import { useServiceRealtime } from '@/lib/realtime';
import { PageHeader } from '@/components/Shell';
import { Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { OverviewTab } from '@/components/service/OverviewTab';
import { PipelinesTab } from '@/components/service/PipelinesTab';
import { ObservabilityTab } from '@/components/service/ObservabilityTab';
import type { LogLine } from '@/components/LogView';

type Tab = 'overview' | 'pipelines' | 'observability';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'observability', label: 'Observability' },
];

export default function ServiceDetailPage({ params }: { params: { id: string } }) {
  const serviceId = params.id;
  const { data: service, isLoading } = useService(serviceId);
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('overview');
  const [envId, setEnvId] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<Record<string, LogLine[]>>({});
  const [podLogs, setPodLogs] = useState<{ message: string; ts: string }[]>([]);

  // Default-select the first environment once the service loads.
  useEffect(() => {
    if (service && !service.environments.some((e) => e.id === envId)) {
      setEnvId(service.environments[0]?.id ?? null);
    }
  }, [service, envId]);

  useServiceRealtime(serviceId, {
    onEvent: (e) => {
      switch (e.type) {
        case 'pipeline.log':
          setLiveLogs((prev) => ({
            ...prev,
            [e.runId]: [
              ...(prev[e.runId] ?? []),
              { step: e.step, level: e.level, message: e.message, ts: e.ts },
            ].slice(-800),
          }));
          break;
        case 'pipeline.status':
          qc.invalidateQueries({ queryKey: ['pipelines', serviceId] });
          qc.invalidateQueries({ queryKey: ['service', serviceId] });
          break;
        case 'reconcile.status':
        case 'deployment.status':
        case 'claim.status':
          qc.invalidateQueries({ queryKey: ['service', serviceId] });
          break;
        case 'metrics.sample':
          if (envId) qc.invalidateQueries({ queryKey: ['metrics', envId] });
          break;
      }
    },
    onPodLog: (e) =>
      setPodLogs((prev) => [...prev, { message: e.message, ts: e.ts }].slice(-400)),
  });

  const env = useMemo(
    () => service?.environments.find((e) => e.id === envId) ?? service?.environments[0],
    [service, envId],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!service) {
    return <p className="text-sm text-slate-400">Service not found.</p>;
  }

  return (
    <div>
      <Link
        href="/services"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> Catalog
      </Link>

      <PageHeader
        title={service.name}
        description={service.description || service.slug}
        action={
          <a
            href={service.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            <GitBranch className="h-3.5 w-3.5" /> {service.defaultBranch}
          </a>
        }
      />

      {/* Environment selector */}
      {service.environments.length > 1 && tab !== 'pipelines' && (
        <div className="mb-4 flex gap-1.5">
          {service.environments.map((e) => (
            <button
              key={e.id}
              onClick={() => setEnvId(e.id)}
              className={clsx(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                e.id === env?.id
                  ? 'border-brand-500 bg-brand-600/15 text-brand-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600',
              )}
            >
              {e.name}
              <StatusBadge status={e.healthStatus} />
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
              tab === t.id
                ? 'border-brand-500 text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && env && <OverviewTab service={service} env={env} />}
      {tab === 'pipelines' && <PipelinesTab serviceId={service.id} liveLogs={liveLogs} />}
      {tab === 'observability' && env && <ObservabilityTab env={env} podLogs={podLogs} />}
    </div>
  );
}
