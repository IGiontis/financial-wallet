import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import { AXIS_TICK, CURSOR_FILL, GRID_STROKE, compactNumber } from "../../analytics/components/chartTheme";
import { TooltipRow, TooltipShell } from "../../analytics/components/TooltipShell";
import type { PlanPeriod } from "../plannerUtils";

interface Row {
  label: string;
  /** What the bar actually covers — one month, or the three of a quarter. */
  span: string;
  income: number;
  /** Negative, so it draws below the axis. */
  outgoing: number;
  balance: number;
}

function FlowTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Row }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    // The span, not the axis label: above eighteen months the bars are quarters,
    // and a bar holding three paydays read as a single month that had somehow
    // been given extra money.
    <TooltipShell title={row.span}>
      <TooltipRow color="var(--color-income)" label={t("planner.moneyIn")} value={`+${formatCurrency(row.income)}`} />
      <TooltipRow color="var(--color-expense)" label={t("planner.moneyOut")} value={`−${formatCurrency(Math.abs(row.outgoing))}`} />
      <TooltipRow color="var(--color-text-primary)" label={t("planner.endWith")} value={formatCurrency(row.balance)} />
    </TooltipShell>
  );
}

interface PlanFlowChartProps {
  periods: PlanPeriod[];
  formatCurrency: (n: number) => string;
  locale: string;
}

/**
 * Where the balance came from, period by period.
 *
 * The card shows the running line, which answers whether the plan stays above
 * zero. Opened out, it can answer the question worth more: *why* a month is
 * tight. Netted into a single line, a January where the same pay met twice the
 * outgoings looks exactly like a January with no pay at all — so the two sides
 * are drawn apart, above and below the axis, with the balance running across
 * them.
 *
 * The bars come from dated events and the line from the daily walk, on purpose:
 * the budget lines accrue by the day and never land on a date, so adding the
 * bars would not reach the balance. The gap between them *is* the day-to-day
 * spending, which is the right thing for it to look like.
 */
export function PlanFlowChart({ periods, formatCurrency, locale }: PlanFlowChartProps) {
  const { t } = useTranslation();

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const yearFmt = useMemo(() => new Intl.DateTimeFormat(locale, { year: "2-digit" }), [locale]);
  const longFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }), [locale]);

  const data = useMemo<Row[]>(
    () =>
      periods.map((period) => ({
        // A quarter is named by its own key; a month by its short name, with
        // the year added in January so a multi-year axis says where it turned.
        label: period.key.includes("Q")
          ? `${period.key.split("-")[1]} ${yearFmt.format(period.start)}`
          : period.start.getMonth() === 0
            ? `${monthFmt.format(period.start)} ${yearFmt.format(period.start)}`
            : monthFmt.format(period.start),
        span: period.key.includes("Q") ? `${monthFmt.format(period.start)} — ${longFmt.format(new Date(period.start.getFullYear(), period.start.getMonth() + 2, 1))}` : longFmt.format(period.start),
        income: period.income,
        outgoing: -period.outgoing,
        balance: period.balance,
      })),
    [periods, monthFmt, yearFmt, longFmt],
  );

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        {/* A small gap on purpose. The only label carrying a year is January's,
            which makes it the widest — and the widest is the first thing a
            generous `minTickGap` drops, so the one tick that says which year
            you are looking at was the one going missing. */}
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={4} />
        {/* Two scales, because the two things are not the same size. A year of
            €1,800 months ends on a balance near €14,000, and sharing one axis
            flattened every bar into the floor while the line used the whole
            height. The left axis is the monthly flow; the right is the balance
            the line traces. */}
        <YAxis yAxisId="flow" tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
        <YAxis yAxisId="balance" orientation="right" tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
        <ReferenceLine yAxisId="flow" y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        <Tooltip content={<FlowTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />

        <Bar yAxisId="flow" dataKey="income" name={t("planner.moneyIn")} fill="var(--color-income)" fillOpacity={0.85} maxBarSize={26} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="flow" dataKey="outgoing" name={t("planner.moneyOut")} fill="var(--color-expense)" fillOpacity={0.85} maxBarSize={26} radius={[0, 0, 3, 3]} />
        <Line
          yAxisId="balance"
          type="monotone"
          dataKey="balance"
          name={t("planner.endWith")}
          stroke="var(--color-text-primary)"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default PlanFlowChart;
