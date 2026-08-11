import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Point {
  label: string;
  rate: number | null;
  income: number;
  net: number;
}

function RateTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.label}>
      <TooltipRow color="var(--color-invest)" label={t("analytics.savingsRate.rate")} value={point.rate === null ? "—" : `${Math.round(point.rate)}%`} />
      <TooltipRow color="var(--color-income)" label={t("analytics.flow.income")} value={formatCurrency(point.income)} />
      <TooltipRow color={point.net >= 0 ? "var(--color-income)" : "var(--color-expense)"} label={t("analytics.savingsRate.kept")} value={formatCurrency(point.net)} />
    </TooltipShell>
  );
}

/**
 * Share of income that didn't get spent, month by month, against your own
 * income-weighted average.
 *
 * Months with no income at all carry a `null` rate rather than a zero — the
 * line breaks there instead of diving to the floor, because "no income" isn't
 * the same claim as "saved nothing".
 */
export default function SavingsRateChart({ data, average, formatCurrency }: { data: Point[]; average?: number; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={(v: number) => `${Math.round(v)}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        {average !== undefined && (
          <ReferenceLine
            y={average}
            stroke="var(--color-text-secondary)"
            strokeDasharray="4 4"
            label={{ value: t("analytics.savingsRate.average", { value: Math.round(average) }), position: "insideTopRight", fontSize: 10.5, fill: "var(--color-text-secondary)" }}
          />
        )}
        <Tooltip content={<RateTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Line type="monotone" dataKey="rate" stroke="var(--color-invest)" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
