import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL, GRID_STROKE } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface HistogramPoint {
  label: string;
  count: number;
  amount: number;
  /** Share of total spend that lands in this bracket. */
  share: number;
}

function BinTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: HistogramPoint }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const bin = payload?.[0]?.payload;
  if (!active || !bin) return null;

  return (
    <TooltipShell title={bin.label}>
      <TooltipRow color="var(--color-invest)" label={t("analytics.histogram.payments")} value={String(bin.count)} />
      <TooltipRow label={t("analytics.histogram.totalling")} value={formatCurrency(bin.amount)} />
      <TooltipRow label={t("analytics.histogram.shareOfSpend")} value={`${Math.round(bin.share)}%`} />
    </TooltipShell>
  );
}

/**
 * How many payments fall into each size bracket. Bars count transactions while
 * the tooltip carries the euros, which is where the useful surprise usually
 * lives: hundreds of small payments often add up to less than a handful of
 * large ones.
 */
export default function AmountHistogram({ data, formatCurrency }: { data: HistogramPoint[]; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} dy={6} interval={0} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<BinTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="count" fill="var(--color-invest)" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}
