import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface TrendSeries {
  id: string;
  name: string;
  color: string;
}

/** One row per month: `label` plus a numeric total under each series id. */
export type TrendRow = Record<string, string | number>;

interface PayloadEntry {
  dataKey?: string | number;
  value?: number;
  color?: string;
  name?: string;
}

function TrendTooltip({
  active,
  payload,
  label,
  series,
  formatCurrency,
  totalLabel,
}: {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
  series: TrendSeries[];
  formatCurrency: (n: number) => string;
  totalLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((entry) => ({
      meta: series.find((s) => s.id === entry.dataKey),
      value: entry.value ?? 0,
    }))
    .filter((r) => r.meta && r.value > 0)
    // Biggest first — the stack draws bottom-up, which is the opposite of how
    // the list should read.
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <TooltipShell title={label}>
      {rows.map((r) => (
        <TooltipRow key={r.meta!.id} color={r.meta!.color} label={r.meta!.name} value={formatCurrency(r.value)} />
      ))}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 6, paddingTop: 6 }}>
        <TooltipRow label={totalLabel} value={formatCurrency(total)} />
      </div>
    </TooltipShell>
  );
}

/**
 * Stacked bands, one per category, so the total height is the month's spend and
 * each band's thickness is that category's share of it.
 *
 * Series order is fixed for the whole window (see `categoryTrend`) — a stack
 * that re-sorted itself every month would be impossible to follow.
 */
export default function CategoryTrendChart({
  data,
  series,
  formatCurrency,
  totalLabel,
}: {
  data: TrendRow[];
  series: TrendSeries[];
  formatCurrency: (n: number) => string;
  totalLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<TrendTooltip series={series} formatCurrency={formatCurrency} totalLabel={totalLabel} />} cursor={{ stroke: GRID_STROKE }} />
        {series.map((s) => (
          <Area key={s.id} type="monotone" dataKey={s.id} name={s.name} stackId="spend" stroke={s.color} strokeWidth={1} fill={s.color} fillOpacity={0.55} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
