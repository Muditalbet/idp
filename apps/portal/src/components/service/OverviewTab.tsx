'use client';

import { ExternalLink, RefreshCw, Rocket, Undo2 } from 'lucide-react';
import { useDeploy, useReconcile, useRollback } from '@/lib/hooks';
import { Button, Card, CardHeader } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeTime, shortImage } from '@/lib/format';
import type { Environment, Service } from '@/lib/types';

export function OverviewTab({ service, env }: { service: Service; env: Environment }) {
  const deploy = useDeploy(service.id);
  const reconcile = useReconcile(service.id);
  const rollback = useRollback(service.id);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Environment: ${env.name}`}
          subtitle={env.namespace}
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => deploy.mutate(env.id)}
                loading={deploy.isPending}
                title="Build the latest commit and deploy"
              >
                <Rocket className="h-3.5 w-3.5" /> Deploy
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => reconcile.mutate(env.id)}
                loading={reconcile.isPending}
                title="Re-apply desired state"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconcile
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rollback.mutate(env.id)}
                loading={rollback.isPending}
                title="Roll back to the previous image"
              >
                <Undo2 className="h-3.5 w-3.5" /> Rollback
              </Button>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Sync">
            <StatusBadge status={env.syncStatus} />
          </Stat>
          <Stat label="Health">
            <StatusBadge status={env.healthStatus} />
          </Stat>
          <Stat label="Replicas">
            <span className="text-sm text-slate-200">{env.replicas}</span>
          </Stat>
          <Stat label="Last reconciled">
            <span className="text-sm text-slate-200">{relativeTime(env.lastReconciledAt)}</span>
          </Stat>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-800 px-5 py-3 text-xs">
          <a
            href={env.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-400 hover:underline"
          >
            {env.host} <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-slate-500">
            image: <span className="font-mono text-slate-300">{shortImage(env.desiredImage)}</span>
          </span>
        </div>
        {env.reconcileError && (
          <div className="border-t border-red-900/40 bg-red-950/30 px-5 py-2 text-xs text-red-300">
            {env.reconcileError}
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Provisioned infrastructure" subtitle="Crossplane-style claim" />
          <div className="p-5">
            <div className="mb-3">
              <StatusBadge status={env.claim?.status ?? 'PENDING'} />
              {env.claim?.message && (
                <span className="ml-2 text-xs text-slate-500">{env.claim.message}</span>
              )}
            </div>
            <ul className="space-y-1.5">
              {(env.claim?.resources ?? []).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{r.kind}</span>
                  <span className="font-mono text-slate-500">{r.name}</span>
                </li>
              ))}
              {(env.claim?.resources ?? []).length === 0 && (
                <li className="text-xs text-slate-600">Awaiting provisioning…</li>
              )}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Latest deployment" />
          <div className="p-5 text-xs">
            {env.latestDeployment ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <StatusBadge status={env.latestDeployment.status} />
                </div>
                <Row label="Image" value={shortImage(env.latestDeployment.image)} mono />
                <Row label="Commit" value={env.latestDeployment.commitSha ?? '—'} mono />
                <Row label="When" value={relativeTime(env.latestDeployment.createdAt)} />
                {env.latestDeployment.commitMessage && (
                  <Row label="Message" value={env.latestDeployment.commitMessage} />
                )}
              </div>
            ) : (
              <p className="text-slate-600">No deployments yet — click Deploy to build &amp; ship.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? 'font-mono text-slate-300' : 'text-slate-300'}>{value}</span>
    </div>
  );
}
