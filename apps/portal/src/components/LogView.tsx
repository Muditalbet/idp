'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { formatTime } from '@/lib/format';

export interface LogLine {
  step?: string;
  level?: string;
  message: string;
  ts: string;
}

const STEP_COLOR: Record<string, string> = {
  CLONE: 'text-sky-400',
  BUILD: 'text-amber-400',
  PUSH: 'text-violet-400',
  DEPLOY: 'text-emerald-400',
  QUEUE: 'text-slate-400',
};

export function LogView({
  lines,
  emptyText = 'No logs yet.',
  className,
}: {
  lines: LogLine[];
  emptyText?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      className={clsx(
        'h-80 overflow-y-auto scrollbar-thin rounded-lg border border-slate-800 bg-black/50 p-3 font-mono text-xs leading-relaxed',
        className,
      )}
    >
      {lines.length === 0 ? (
        <p className="text-slate-600">{emptyText}</p>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-slate-600">{formatTime(l.ts)}</span>
            {l.step && (
              <span className={clsx('shrink-0 font-semibold', STEP_COLOR[l.step] ?? 'text-slate-400')}>
                {l.step.padEnd(6)}
              </span>
            )}
            <span
              className={clsx(
                'whitespace-pre-wrap break-all',
                l.level === 'error' ? 'text-red-400' : 'text-slate-300',
              )}
            >
              {l.message}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
