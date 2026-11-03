import { useId } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import type { IncomesBillsMonth } from "../incomesVsBills";
import { AXIS_TICK, CURSOR_FILL, GRID_STROKE, signedCompact, signedWith } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface IncomesBillsPoint extends IncomesBillsMonth {
  label: string;
}

const INCOME = "var(--chart-income)";
const BILLS = "var(--chart-expense)";
const NET = "var(--chart-net)";

function IncomesBillsTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: IncomesBillsPoint }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell title={`${row.label} · ${t(`analytics.incomesBills.${row.source}`)}`}>
      <TooltipRow color={INCOME} label={t("analytics.incomesBills.income")} value={formatCurrency(row.income)} />
      <TooltipRow color={BILLS} label={t("analytics.incomesBills.bills")} value={formatCurrency(row.bills)} />
      <TooltipRow color={NET} label={t("analytics.incomesBills.difference")} value={signedWith(formatCurrency)(row.difference)} />
    </TooltipShell>
  );
}

/**
 * Twelve months, each a pair of bars — what came in (green, left) and what the
 * bills took (red, right) — with the month's difference as a line over them.
 *
 * A month still to come is the plan, not the record, and it has to look it:
 * its bars are striped, the record's are solid (`monthSource` decides which
 * is which). Striped rather than only paler, so the difference survives a
 * screen in the sun and a reader who does not see colour.
 */
export default function IncomesBillsChart({ data, formatCurrency, compact }: { data: IncomesBillsPoint[]; formatCurrency: (n: number) => string; compact?: boolean }) {
  // `useId` gives «:r1:», which an SVG url() reference does not survive.
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const hatch = (color: string, name: string) => (
    <pattern id={`${id}-${name}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
      <rect width={6} height={6} fill={color} fillOpacity={0.28} />
      <line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeWidth={3} />
    </pattern>
  );

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <defs>
          {hatch(INCOME, "in")}
          {hatch(BILLS, "out")}
        </defs>
        {!compact && <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />}
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval={compact ? "preserveStartEnd" : 0} minTickGap={4} />
        <YAxis hide={compact} tickFormatter={signedCompact} tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<IncomesBillsTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <ReferenceLine y={0} stroke={GRID_STROKE} />
        <Bar dataKey="income" maxBarSize={22} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.source === "scheduled" ? `url(#${id}-in)` : INCOME} stroke={INCOME} strokeWidth={row.source === "scheduled" ? 1 : 0} />
          ))}
        </Bar>
        <Bar dataKey="bills" maxBarSize={22} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.source === "scheduled" ? `url(#${id}-out)` : BILLS} stroke={BILLS} strokeWidth={row.source === "scheduled" ? 1 : 0} />
          ))}
        </Bar>
        <Line type="monotone" dataKey="difference" stroke={NET} strokeWidth={2} dot={{ r: 2.5, fill: NET, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
