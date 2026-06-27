import Link from 'next/link';
import { GitBranch, Users } from 'lucide-react';
import type { Service } from '@/lib/types';
import { Card } from './ui';
import { StatusBadge } from './StatusBadge';

export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link href={`/services/${service.id}`}>
      <Card className="h-full p-4 transition-colors hover:border-slate-700 hover:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-100">{service.name}</p>
            <p className="truncate font-mono text-xs text-slate-500">{service.slug}</p>
          </div>
          <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
            {service.template}
          </span>
        </div>

        {service.description && (
          <p className="mt-2 line-clamp-2 text-xs text-slate-400">{service.description}</p>
        )}

        <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {service.team?.name ?? '—'}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {service.defaultBranch}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
          {service.environments.map((env) => (
            <div key={env.id} className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400">{env.name}</span>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={env.syncStatus} />
                <StatusBadge status={env.healthStatus} />
              </div>
            </div>
          ))}
          {service.environments.length === 0 && (
            <p className="text-xs text-slate-600">No environments</p>
          )}
        </div>
      </Card>
    </Link>
  );
}
