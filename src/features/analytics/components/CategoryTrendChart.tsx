import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, GRID_STROKE, amountTicks, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface TrendSeries {
  id: string;
  name: string;
  color: string;
  /** Set once the palette wraps, so a repeated colour is still one line apart. */
  dash?: string;
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
    .map((entry) => ({ meta: series.find((s) => s.id === entry.dataKey), value: entry.value ?? 0 }))
    .filter((r) => r.meta && r.value > 0)
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
 * One coloured line per category against a shared amount axis — a league table
 * rather than a stack.
 *
 * Stacked bands showed the month's total honestly but hid every category's own
 * path inside it: a band sitting on top of a growing one rises on the screen
 * while its own figure falls, so "is this going up or down" was unanswerable
 * for all but the bottom series. Given a common baseline each line is read on
 * its own, and crossings say which category overtook which.
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
  // Scaled to the biggest single figure on the chart, not to the month's total:
  // these are separate lines now, so nothing stacks and the tallest point is
  // the tallest one line reaches.
  const ticks = useMemo(() => {
    const peak = data.reduce((max, row) => series.reduce((m, s) => Math.max(m, Number(row[s.id]) || 0), max), 0);
    return amountTicks(peak);
  }, [data, series]);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip content={<TrendTooltip series={series} formatCurrency={formatCurrency} totalLabel={totalLabel} />} cursor={{ stroke: GRID_STROKE }} />
        {series.map((s) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.name}
            stroke={s.color}
            strokeDasharray={s.dash}
            strokeWidth={2}
            // A dot per month makes a three-point line legible; recharts hides
            // them again once the window is long enough for them to merge.
            dot={{ r: 2.5, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
