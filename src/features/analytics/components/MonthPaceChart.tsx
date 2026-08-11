import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import type { PacePoint } from "../analyticsUtils";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

function PaceTooltip({ active, payload, label, formatCurrency }: { active?: boolean; payload?: { payload?: PacePoint }[]; label?: number; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const gap = point.current !== null && point.previous !== null ? point.current - point.previous : undefined;

  return (
    <TooltipShell title={t("analytics.pace.day", { day: label ?? point.day })}>
      <TooltipRow color="var(--color-expense)" label={t("analytics.pace.thisMonth")} value={point.current === null ? "—" : formatCurrency(point.current)} />
      <TooltipRow color="var(--color-text-secondary)" label={t("analytics.pace.lastMonth")} value={point.previous === null ? "—" : formatCurrency(point.previous)} />
      {gap !== undefined && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 6, paddingTop: 6 }}>
          <TooltipRow label={t("analytics.pace.difference")} value={`${gap >= 0 ? "+" : "−"}${formatCurrency(Math.abs(gap))}`} />
        </div>
      )}
    </TooltipShell>
  );
}

/**
 * Both months as running totals on the same day-of-month axis, so "am I ahead
 * of last month?" is answered by which line is on top right now — not by
 * comparing two finished totals when it's already too late to act.
 *
 * This month's line simply stops at today; it isn't carried flat to the end of
 * the month, which would read as a spending freeze.
 */
export default function MonthPaceChart({ data, formatCurrency }: { data: PacePoint[]; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<PaceTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Line type="monotone" dataKey="previous" stroke="var(--color-text-secondary)" strokeWidth={1.75} strokeDasharray="4 3" dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="current" stroke="var(--color-expense)" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
