import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import type { CommittedMonth } from "../analyticsUtils";

interface Point extends CommittedMonth {
  label: string;
}

function SplitTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.label}>
      <TooltipRow color="var(--color-goal)" label={t("analytics.committed.committed")} value={formatCurrency(point.committed)} />
      <TooltipRow color="var(--color-expense)" label={t("analytics.committed.free")} value={formatCurrency(point.free)} />
      <TooltipRow label={t("analytics.committed.share")} value={`${Math.round(point.share * 100)}%`} />
    </TooltipShell>
  );
}

/**
 * Each month split into what was already spoken for and what was not.
 *
 * Stacked, because the two parts make up one month's outgoings and the total
 * matters as much as the split. Which half is growing is the point: rising
 * committed spending is a different problem from rising discretionary
 * spending, and needs a different answer.
 */
export default function CommittedSplitChart({ rows, formatCurrency, monthLabel }: { rows: CommittedMonth[]; formatCurrency: (n: number) => string; monthLabel: (d: Date) => string }) {
  const data = useMemo<Point[]>(() => rows.map((row) => ({ ...row, label: monthLabel(row.start) })), [rows, monthLabel]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
        <Tooltip content={<SplitTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Area type="monotone" dataKey="committed" stackId="s" stroke="var(--color-goal)" fill="var(--color-goal)" fillOpacity={0.55} isAnimationActive={false} />
        <Area type="monotone" dataKey="free" stackId="s" stroke="var(--color-expense)" fill="var(--color-expense)" fillOpacity={0.3} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
