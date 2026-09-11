import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface IncomeMonth {
  label: string;
  income: number;
}

function IncomeTooltip({ active, payload, average, formatCurrency }: { active?: boolean; payload?: { payload?: IncomeMonth }[]; average: number; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const gap = row.income - average;

  return (
    <TooltipShell title={row.label}>
      <TooltipRow color="var(--color-income)" label={t("analytics.income.thatMonth")} value={formatCurrency(row.income)} />
      <TooltipRow
        color="var(--color-text-secondary)"
        label={t("analytics.income.vsAverage")}
        value={`${gap >= 0 ? "+" : "−"}${formatCurrency(Math.abs(gap))}`}
      />
    </TooltipShell>
  );
}

/**
 * What arrived each month, against the average of the window.
 *
 * The question this answers is not how much you earn — the figure above the
 * chart says that — but whether you can count on it. A salaried month and a
 * freelance month can total the same across a year and want completely
 * different plans behind them, and the only thing that separates them is how
 * far the bars stray from the line.
 */
export default function IncomeMonthsChart({ data, average, formatCurrency }: { data: IncomeMonth[]; average: number; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<IncomeTooltip average={average} formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="income" fill="var(--color-income)" fillOpacity={0.85} maxBarSize={34} radius={[3, 3, 0, 0]} />
        {/* Drawn after the bars so it reads on top of them — it is the thing
            each bar is being compared against, not another series. */}
        <ReferenceLine y={average} stroke="var(--color-text-primary)" strokeDasharray="4 3" strokeWidth={1.5} />
      </BarChart>
    </ResponsiveContainer>
  );
}
