import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import styles from "./css/Dashboard.module.css";

export interface TrioRow {
  label: string;
  income: number;
  expenses: number;
  /** What was kept that month. */
  net: number;
  /** Running total of `net` — the net position at the month's end. */
  cumulative: number;
}

type Field = "income" | "expenses" | "cumulative";

const SYNC_ID = "analytics-month-trio";

function MiniTooltip({ active, payload, field, color, label, formatCurrency }: { active?: boolean; payload?: { payload?: TrioRow }[]; field: Field; color: string; label: string; formatCurrency: (n: number) => string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell title={row.label}>
      <TooltipRow color={color} label={label} value={formatCurrency(row[field])} />
    </TooltipShell>
  );
}

/** A point drawn as a ring on the card, so a line of twelve months reads as twelve months. */
const ring = (color: string) => ({ r: 3, strokeWidth: 2, stroke: color, fill: "var(--color-surface)" });
const activeRing = (color: string) => ({ r: 5, strokeWidth: 2, stroke: "var(--color-surface)", fill: color });

/**
 * Money in, money out and the running net position, as three small charts on
 * one month axis. Pointing at a month in any of them lights the same month in
 * all three, so "the month the bonus came" and "the month the holiday cost"
 * are one look, not three charts to line up by eye.
 */
export default function MonthTrioChart({ data, formatCurrency }: { data: TrioRow[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const gradient = `trio-net-${useId().replace(/:/g, "")}`;
  const sum = (field: "income" | "expenses") => data.reduce((s, row) => s + row[field], 0);
  const end = data.length > 0 ? data[data.length - 1].cumulative : 0;

  const charts: { field: Field; label: string; color: string; total: string; axis?: boolean }[] = [
    { field: "income", label: t("analytics.flow.income"), color: "var(--chart-income)", total: t("analytics.dashboard.total", { amount: formatCurrency(sum("income")) }) },
    { field: "expenses", label: t("analytics.flow.expenses"), color: "var(--chart-expense)", total: t("analytics.dashboard.total", { amount: formatCurrency(sum("expenses")) }) },
    { field: "cumulative", label: t("analytics.netPosition.title"), color: "var(--chart-net)", total: t("analytics.dashboard.end", { amount: formatCurrency(end) }), axis: true },
  ];

  return (
    <div className={styles.trio}>
      {charts.map((chart) => (
        <div key={chart.field}>
          <div className={styles.trioHead}>
            <span className={styles.trioName}>
              <span className={styles.trioDot} style={{ background: chart.color }} aria-hidden />
              {chart.label}
            </span>
            <span className={styles.trioTotal}>{chart.total}</span>
          </div>
          <div className={chart.axis ? styles.trioChartAxis : styles.trioChart}>
            <ResponsiveContainer width="100%" height="100%" debounce={200}>
              {chart.field === "cumulative" ? (
                <AreaChart data={data} syncId={SYNC_ID} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={chart.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickCount={3} />
                  <Tooltip content={<MiniTooltip field={chart.field} color={chart.color} label={chart.label} formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
                  <Area type="monotone" dataKey={chart.field} stroke={chart.color} strokeWidth={2} fill={`url(#${gradient})`} dot={ring(chart.color)} activeDot={activeRing(chart.color)} />
                </AreaChart>
              ) : (
                <LineChart data={data} syncId={SYNC_ID} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  {/* No ticks of its own: the last chart's axis is the months for all three. */}
                  <XAxis dataKey="label" hide />
                  <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickCount={3} />
                  <Tooltip content={<MiniTooltip field={chart.field} color={chart.color} label={chart.label} formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
                  <Line type="monotone" dataKey={chart.field} stroke={chart.color} strokeWidth={2} dot={ring(chart.color)} activeDot={activeRing(chart.color)} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
