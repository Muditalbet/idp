'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Boxes, CheckCircle2, GitPullRequestArrow } from 'lucide-react';
import { useServices } from '@/lib/hooks';
import { useServicesRealtime } from '@/lib/realtime';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/Shell';
import { ServiceCard } from '@/components/ServiceCard';
import { Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import type { IdpEvent } from '@/lib/types';

interface ActivityItem {
  id: string;
  label: string;
  detail?: string;
  ts: string;
}

const EVENT_LABEL: Record<IdpEvent['type'], string> = {
  'claim.status': 'Infra claim',
  'pipeline.status': 'Pipeline',
  'pipeline.log': 'Pipeline log',
  'reconcile.status': 'Reconcile',
  'deployment.status': 'Deployment',
  'metrics.sample': 'Metrics',
};

export default function OverviewPage() {
  const { data: services, isLoading } = useServices();
  const qc = useQueryClient();
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const serviceIds = useMemo(() => (services ?? []).map((s) => s.id), [services]);

  useServicesRealtime(serviceIds, (e) => {
    if (e.type === 'pipeline.log' || e.type === 'metrics.sample') {
      // keep cache fresh but don't spam the feed
      if (e.type === 'pipeline.log') return;
    }
    if (e.type === 'reconcile.status' || e.type === 'deployment.status' || e.type === 'claim.status') {
      qc.invalidateQueries({ queryKey: ['services'] });
    }
    const detail =
      e.type === 'claim.status'
        ? e.status
        : e.type === 'pipeline.status'
          ? e.status
          : e.type === 'reconcile.status'
            ? `${e.syncStatus} · ${e.healthStatus}`
            : e.type === 'deployment.status'
              ? e.status
              : undefined;
    setActivity((prev) =>
      [{ id: `${e.ts}-${Math.random()}`, label: EVENT_LABEL[e.type], detail, ts: e.ts }, ...prev].slice(0, 25),
    );
  });

  const stats = useMemo(() => {
    const all = services ?? [];
    const envs = all.flatMap((s) => s.environments);
    return {
      services: all.length,
      environments: envs.length,
      healthy: envs.filter((e) => e.healthStatus === 'HEALTHY').length,
      outOfSync: envs.filter((e) => e.syncStatus === 'OUT_OF_SYNC').length,
    };
  }, [services]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Your services and what the platform is doing right now."
        action={
          <Link href="/services/new">
            <Button>New Service</Button>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Boxes className="h-4 w-4" />} label="Services" value={stats.services} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Environments" value={stats.environments} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Healthy" value={stats.healthy} accent="emerald" />
        <StatCard
          icon={<GitPullRequestArrow className="h-4 w-4" />}
          label="Out of sync"
          value={stats.outOfSync}
          accent={stats.outOfSync > 0 ? 'amber' : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Services</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (services ?? []).length === 0 ? (
            <EmptyState
              title="No services yet"
              description="Scaffold your first service and watch the platform provision its namespace, CI/CD, DNS and observability."
              action={
                <Link href="/services/new">
                  <Button>Create a service</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(services ?? []).map((s) => (
                <ServiceCard key={s.id} service={s} />
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Live activity</h2>
          <Card>
            <CardHeader title="Event stream" subtitle="Real-time over WebSocket" />
            <div className="max-h-[28rem] divide-y divide-slate-800 overflow-y-auto scrollbar-thin">
              {activity.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-slate-500">
                  Waiting for platform events…
                </p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">{a.label}</p>
                      {a.detail && <p className="truncate text-[11px] text-slate-500">{a.detail}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(a.ts)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: 'emerald' | 'amber';
}) {
  const color =
    accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-slate-100';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
    </Card>
  );
}
