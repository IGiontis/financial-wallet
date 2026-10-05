import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface PlanActualRow {
  label: string;
  actual: number;
  /** The plan as it stands today, laid over the month — null when there is none. */
  plan: number | null;
  /** The same month a year before, or null where the records do not reach. */
  lastYear: number | null;
}

function PlanTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: PlanActualRow }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const over = row.plan === null ? undefined : Math.round((row.actual - row.plan) * 100) / 100;
  return (
    <TooltipShell title={row.label}>
      <TooltipRow color="var(--chart-expense)" label={t("analytics.dashboard.actual")} value={formatCurrency(row.actual)} />
      {row.plan !== null && <TooltipRow label={t("analytics.dashboard.plan")} value={formatCurrency(row.plan)} />}
      {over !== undefined && <TooltipRow label={t("analytics.dashboard.difference")} value={`${over > 0 ? "+" : over < 0 ? "−" : ""}${formatCurrency(Math.abs(over))}`} />}
      {row.lastYear !== null && <TooltipRow label={t("analytics.dashboard.lastYear")} value={formatCurrency(row.lastYear)} />}
    </TooltipShell>
  );
}

/**
 * Spending three ways: what it was (solid), what the plan says (dashed), what
 * it was a year ago (dotted). One colour for all three — it is the same
 * measure each time — and the stroke says which version, so the legend is
 * read once and not decoded.
 *
 * The two broken lines do not animate in: recharts draws a line in by
 * animating its dash pattern, and the one given here never came back — the
 * plan was drawn solid.
 */
export default function PlanActualChart({ data, formatCurrency }: { data: PlanActualRow[]; formatCurrency: (n: number) => string }) {
  const hasPlan = data.some((row) => row.plan !== null);
  const hasLastYear = data.some((row) => row.lastYear !== null);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<PlanTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        {hasLastYear && <Line type="monotone" dataKey="lastYear" stroke="var(--chart-expense)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
        {hasPlan && <Line type="monotone" dataKey="plan" stroke="var(--chart-expense)" strokeOpacity={0.8} strokeWidth={2} strokeDasharray="7 5" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="actual" stroke="var(--chart-expense)" strokeWidth={2.25} dot={{ r: 3, strokeWidth: 2, fill: "var(--color-surface)" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
