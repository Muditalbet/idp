'use client';

import { Server } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAdminAudit, useAdminCluster } from '@/lib/hooks';
import { PageHeader } from '@/components/Shell';
import { Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/format';

export default function AdminPage() {
  const { user } = useAuth();
  const { data: cluster, isLoading } = useAdminCluster();
  const { data: audit } = useAdminAudit();

  if (user?.role !== 'PLATFORM_ADMIN') {
    return <EmptyState title="Platform admins only" description="You don't have access to this page." />;
  }

  return (
    <div>
      <PageHeader title="Platform Admin" description="Cluster health and the platform audit trail." />

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Services" value={cluster?.counts.services} />
        <Metric label="Environments" value={cluster?.counts.environments} />
        <Metric label="Live deployments" value={cluster?.counts.deployments} />
        <Metric label="Pipeline runs" value={cluster?.counts.pipelineRuns} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Cluster nodes"
            subtitle={cluster?.cluster.reachable ? 'kind cluster reachable' : 'cluster unreachable'}
          />
          <div className="p-5">
            {isLoading ? (
              <Spinner />
            ) : !cluster?.cluster.reachable ? (
              <p className="text-xs text-amber-400">
                Cluster not reachable — is Docker + kind running?
              </p>
            ) : cluster.cluster.nodes.length === 0 ? (
              <p className="text-xs text-slate-500">No nodes reported.</p>
            ) : (
              <ul className="space-y-2">
                {cluster.cluster.nodes.map((n) => (
                  <li key={n.name} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-200">
                      <Server className="h-4 w-4 text-slate-500" />
                      {n.name}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {n.version}
                      <StatusBadge status={n.ready ? 'HEALTHY' : 'DEGRADED'} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {cluster && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                {Object.entries(cluster.health).map(([status, count]) => (
                  <span key={status} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <StatusBadge status={status} /> {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Audit log" subtitle="Recent platform actions" />
          <div className="max-h-[24rem] divide-y divide-slate-800 overflow-y-auto scrollbar-thin">
            {(audit ?? []).length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No audit entries yet.</p>
            ) : (
              (audit ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{a.action}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {a.actorEmail ?? 'system'}
                      {a.targetType ? ` · ${a.targetType}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(a.ts)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value ?? '—'}</p>
    </Card>
  );
}
