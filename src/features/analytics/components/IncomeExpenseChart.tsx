import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Point {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

function FlowTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.label}>
      <TooltipRow color="var(--color-income)" label={t("analytics.flow.income")} value={formatCurrency(point.income)} />
      <TooltipRow color="var(--color-expense)" label={t("analytics.flow.expenses")} value={formatCurrency(point.expenses)} />
      <TooltipRow
        color={point.net >= 0 ? "var(--color-income)" : "var(--color-expense)"}
        label={t("analytics.flow.net")}
        value={`${point.net >= 0 ? "+" : ""}${formatCurrency(point.net)}`}
      />
    </TooltipShell>
  );
}

/**
 * The two sides as bars with what survived as a line on top. A month where the
 * line dips under zero is one that ate into savings — much easier to spot than
 * comparing two bar heights by eye.
 */
export default function IncomeExpenseChart({ data, formatCurrency }: { data: Point[]; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        <Tooltip content={<FlowTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="income" fill="var(--color-income)" fillOpacity={0.85} maxBarSize={22} radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" fill="var(--color-expense)" fillOpacity={0.85} maxBarSize={22} radius={[3, 3, 0, 0]} />
        <Line type="monotone" dataKey="net" stroke="var(--color-text-primary)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
