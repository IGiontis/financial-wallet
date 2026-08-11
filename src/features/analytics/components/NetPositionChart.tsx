import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Point {
  label: string;
  cumulative: number;
  net: number;
}

interface TooltipEntry {
  payload?: Point;
}

function NetTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: TooltipEntry[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.label}>
      <TooltipRow color="var(--bs-primary)" label={t("analytics.netPosition.running")} value={formatCurrency(point.cumulative)} />
      <TooltipRow
        color={point.net >= 0 ? "var(--color-income)" : "var(--color-expense)"}
        label={t("analytics.netPosition.thatMonth")}
        value={`${point.net >= 0 ? "+" : ""}${formatCurrency(point.net)}`}
      />
    </TooltipShell>
  );
}

/**
 * Running total of everything kept since the start of the window. The zero line
 * is always drawn: crossing it is the whole point of the chart, and without the
 * reference a dip below reads like any other slope.
 */
export default function NetPositionChart({ data, formatCurrency }: { data: Point[]; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="netPositionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bs-primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--bs-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        <Tooltip content={<NetTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Area type="monotone" dataKey="cumulative" stroke="var(--bs-primary)" strokeWidth={2} fill="url(#netPositionFill)" dot={false} activeDot={{ r: 3.5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
