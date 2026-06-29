'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui';

interface Point {
  ts: string;
  value: number;
}

export function MetricChart({
  title,
  unit,
  data,
  color = '#6366f1',
  kind = 'line',
}: {
  title: string;
  unit?: string;
  data: Point[];
  color?: string;
  kind?: 'line' | 'area';
}) {
  const points = data.map((p) => ({
    t: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    value: p.value,
  }));
  const latest = data.length > 0 ? data[data.length - 1]!.value : 0;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-300">{title}</span>
        <span className="font-mono text-sm text-slate-100">
          {latest.toLocaleString()}
          {unit && <span className="ml-1 text-xs text-slate-500">{unit}</span>}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'area' ? (
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={`g-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} />
              <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: '#94a3b8' }} />
              <Area type="monotone" dataKey="value" stroke={color} fill={`url(#g-${title})`} strokeWidth={2} />
            </AreaChart>
          ) : (
            <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} />
              <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: '#94a3b8' }} />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const TOOLTIP = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 8,
  fontSize: 12,
} as const;
