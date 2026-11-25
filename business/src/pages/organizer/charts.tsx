// Recharts wrappers styled for the dark theme.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ksh, num } from '@shared/utils';

const axis = { stroke: '#6b7192', fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = {
  contentStyle: { background: '#131628', border: '1px solid #343a5c', borderRadius: 12, color: '#f5f6fb', fontSize: 12 },
  labelStyle: { color: '#9aa0bb' }, cursor: { fill: 'rgba(255,255,255,.04)' },
};

export function RevenueArea({ data, height = 220 }: { data: { label: string; value: number }[]; height?: number }) {
  if (!data.length) return <p className="grid place-items-center text-sm text-muted" style={{ height }}>No sales yet</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} /><stop offset="100%" stopColor="#22c55e" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#232741" />
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis {...axis} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip {...tip} formatter={(v) => [ksh(Number(v)), 'Revenue']} />
        <Area type="monotone" dataKey="value" stroke="#4ade80" strokeWidth={2.5} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, height = 160, color = '#a78bfa', unit = '' }: { data: { label: string; value: number }[]; height?: number; color?: string; unit?: string }) {
  if (!data.length || data.every((d) => !d.value)) return <p className="grid place-items-center text-sm text-muted" style={{ height }}>No data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#232741" />
        <XAxis dataKey="label" {...axis} minTickGap={12} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} formatter={(v) => [num(Number(v)) + unit, '']} separator="" />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
