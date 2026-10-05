import { useMemo } from "react";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { keyPoints } from "../dashboardUtils";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Row {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

function FlowTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Row }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell title={row.label}>
      <TooltipRow color="var(--chart-income)" label={t("analytics.flow.income")} value={formatCurrency(row.income)} />
      <TooltipRow color="var(--chart-expense)" label={t("analytics.flow.expenses")} value={formatCurrency(row.expenses)} />
      <TooltipRow label={t("analytics.flow.net")} value={`${row.net >= 0 ? "+" : ""}${formatCurrency(row.net)}`} />
    </TooltipShell>
  );
}

/** What recharts hands a label — loosely typed on its side, so checked here. */
interface LabelProps {
  x?: unknown;
  y?: unknown;
  value?: unknown;
  index?: unknown;
}

/**
 * The figure beside a point — on the highest, the lowest and the last only.
 * Income's sit above its line and spending's below, so where the two lines
 * meet the labels still part.
 */
function pointLabel(marked: Set<number>, color: string, below: boolean) {
  return function PointLabel({ x, y, value, index }: LabelProps) {
    if (typeof index !== "number" || !marked.has(index) || typeof value !== "number") return null;
    return (
      <text x={Number(x)} y={Number(y) + (below ? 15 : -8)} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={color}>
        {compactNumber(value)}
      </text>
    );
  };
}

/** Money in and money out on one axis, each point a ring, a few of them named. */
export default function LabelledFlowChart({ data, formatCurrency }: { data: Row[]; formatCurrency: (n: number) => string }) {
  const incomeMarks = useMemo(() => keyPoints(data.map((row) => row.income)), [data]);
  const expenseMarks = useMemo(() => keyPoints(data.map((row) => row.expenses)), [data]);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 18, right: 14, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<FlowTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Line type="monotone" dataKey="income" stroke="var(--chart-income)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--color-surface)" }} activeDot={{ r: 5 }}>
          <LabelList dataKey="income" content={pointLabel(incomeMarks, "var(--chart-income)", false)} />
        </Line>
        <Line type="monotone" dataKey="expenses" stroke="var(--chart-expense)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--color-surface)" }} activeDot={{ r: 5 }}>
          <LabelList dataKey="expenses" content={pointLabel(expenseMarks, "var(--chart-expense)", true)} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}
