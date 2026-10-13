import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE, compactNumber, signedWith } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import type { TwoWayBucket } from "../twoWay";

export interface TwoWayPoint extends TwoWayBucket {
  label: string;
}

function TwoWayTooltip({ active, payload, running, formatCurrency }: { active?: boolean; payload?: { payload?: TwoWayPoint }[]; running: boolean; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const inn = running ? row.cumIn : row.in;
  const out = running ? row.cumOut : row.out;
  const net = running ? row.cumNet : row.net;
  return (
    <TooltipShell title={running ? t("analytics.twoWay.untilThen", { period: row.label }) : row.label}>
      <TooltipRow color="var(--color-income)" label={running ? t("analytics.twoWay.in") : t("analytics.twoWay.inTimes", { count: row.inCount })} value={formatCurrency(inn)} />
      <TooltipRow color="var(--color-expense)" label={running ? t("analytics.twoWay.out") : t("analytics.twoWay.outTimes", { count: row.outCount })} value={formatCurrency(out)} />
      <TooltipRow label={t("analytics.twoWay.net")} value={signedWith(formatCurrency)(net)} />
    </TooltipShell>
  );
}

/**
 * Two lines for one category: what came in under it and what went out, per
 * period or added up from the start. Added up, the gap between them is the
 * whole story — a betting habit reads as two lines drifting apart.
 */
export default function TwoWayChart({ data, running, formatCurrency, compact }: { data: TwoWayPoint[]; running: boolean; formatCurrency: (n: number) => string; compact?: boolean }) {
  const inKey = running ? "cumIn" : "in";
  const outKey = running ? "cumOut" : "out";
  // A dot where something happened, so one win in a quiet year is not a bend in a line.
  const dot = (key: "inCount" | "outCount", color: string) =>
    function Dot(props: { cx?: number; cy?: number; payload?: TwoWayPoint; index?: number }) {
      const { cx, cy, payload, index } = props;
      if (cx === undefined || cy === undefined || !payload || payload[key] === 0) return <g key={index} />;
      return <circle key={index} cx={cx} cy={cy} r={3} fill={color} stroke="var(--color-background-primary)" strokeWidth={1} />;
    };

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={14} />
        <YAxis hide={compact} tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<TwoWayTooltip running={running} formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Line type="monotone" dataKey={inKey} stroke="var(--color-income)" strokeWidth={2} dot={dot("inCount", "var(--color-income)")} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line type="monotone" dataKey={outKey} stroke="var(--color-expense)" strokeWidth={2} dot={dot("outCount", "var(--color-expense)")} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
