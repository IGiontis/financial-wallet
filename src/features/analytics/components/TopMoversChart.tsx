import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import type { CategoryDelta } from "../analyticsUtils";

interface Point extends CategoryDelta {
  name: string;
}

function MoverTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.name}>
      <TooltipRow label={t("analytics.movers.now")} value={formatCurrency(point.current)} />
      <TooltipRow label={t("analytics.movers.before")} value={formatCurrency(point.previous)} />
      <TooltipRow
        color={point.delta > 0 ? "var(--color-expense)" : "var(--color-income)"}
        label={t("analytics.movers.change")}
        value={`${point.delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(point.delta))}`}
      />
    </TooltipShell>
  );
}

/**
 * Each category's change against the previous window, biggest movement first.
 *
 * Diverging from a centre line rather than stacked from zero: the quantity that
 * matters here is the change, so it is the one given the length. Sorting by
 * movement instead of by size is the other half — rent staying rent tells you
 * nothing, and a small habit that doubled tells you a lot.
 */
export default function TopMoversChart({ rows, nameFor, formatCurrency, limit = 7 }: { rows: CategoryDelta[]; nameFor: (id: string) => string; formatCurrency: (n: number) => string; limit?: number }) {
  const data = useMemo<Point[]>(() => rows.slice(0, limit).map((row) => ({ ...row, name: nameFor(row.categoryId) })).reverse(), [rows, nameFor, limit]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={92} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="var(--color-border-primary)" />
        <Tooltip content={<MoverTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="delta" radius={3} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.categoryId} fill={row.delta > 0 ? "var(--color-expense)" : "var(--color-income)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
