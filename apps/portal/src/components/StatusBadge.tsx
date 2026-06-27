import clsx from 'clsx';

const STYLES: Record<string, { label?: string; cls: string }> = {
  // Sync
  SYNCED: { label: 'Synced', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  OUT_OF_SYNC: { label: 'OutOfSync', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  // Health
  HEALTHY: { label: 'Healthy', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  PROGRESSING: { label: 'Progressing', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  DEGRADED: { label: 'Degraded', cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
  MISSING: { label: 'Missing', cls: 'text-slate-400 bg-slate-700/30 border-slate-600/40' },
  // Claim
  PENDING: { label: 'Pending', cls: 'text-slate-300 bg-slate-700/30 border-slate-600/40' },
  PROVISIONING: { label: 'Provisioning', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  PROVISIONED: { label: 'Provisioned', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  // Pipeline
  QUEUED: { label: 'Queued', cls: 'text-slate-300 bg-slate-700/30 border-slate-600/40' },
  RUNNING: { label: 'Running', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  SUCCESS: { label: 'Success', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  CANCELED: { label: 'Canceled', cls: 'text-slate-400 bg-slate-700/30 border-slate-600/40' },
  // Deployment
  DEPLOYING: { label: 'Deploying', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  DEPLOYED: { label: 'Deployed', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  SUPERSEDED: { label: 'Superseded', cls: 'text-slate-400 bg-slate-700/30 border-slate-600/40' },
  ROLLED_BACK: { label: 'Rolled back', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  // Shared
  FAILED: { label: 'Failed', cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
  UNKNOWN: { label: 'Unknown', cls: 'text-slate-400 bg-slate-700/30 border-slate-600/40' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STYLES[status] ?? { cls: 'text-slate-300 bg-slate-700/30 border-slate-600/40' };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        s.cls,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.label ?? status}
    </span>
  );
}
