import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL, GRID_STROKE, moneyAxis, seriesColor, seriesDash } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface TrendPoint {
  key: string;
  label: string;
  total: number;
  [categoryId: string]: number | string;
}

interface Series {
  id: string;
  name: string;
}

function TrendTooltip({ active, payload, series, formatCurrency }: { active?: boolean; payload?: { payload?: TrendPoint }[]; series: Series[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell title={row.label}>
      {series.map((s, i) => (
        <TooltipRow key={s.id} color={seriesColor(i)} label={s.name} value={formatCurrency(Number(row[s.id] ?? 0))} />
      ))}
      {series.length > 1 && <TooltipRow label={t("common.total")} value={formatCurrency(row.total)} />}
    </TooltipShell>
  );
}

/**
 * The picked categories' spending per month, or per year.
 *
 * One category reads best as bars — each month its own block, «πόσο πήγε τον
 * Μάρτιο» answered by a height. Two or more months-long series as bars become a
 * comb nobody can follow, so they are lines, one colour (and past six, one dash)
 * each. Years are few, so they stay bars side by side whatever the count.
 */
export default function CategoryTrendChart({ data, series, bars, formatCurrency, compact }: { data: TrendPoint[]; series: Series[]; bars: boolean; formatCurrency: (n: number) => string; compact?: boolean }) {
  const axes = (
    <>
      {!compact && <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />}
      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={10} />
      <YAxis {...moneyAxis(formatCurrency)} />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      {bars ? (
        <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={2}>
          {axes}
          <Tooltip content={<TrendTooltip series={series} formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
          {series.map((s, i) => (
            <Bar key={s.id} dataKey={s.id} name={s.name} fill={seriesColor(i)} fillOpacity={0.85} maxBarSize={34} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          {axes}
          <Tooltip content={<TrendTooltip series={series} formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={seriesColor(i)}
              strokeDasharray={seriesDash(i)}
              strokeWidth={2}
              dot={{ r: 2.5, fill: seriesColor(i), strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
