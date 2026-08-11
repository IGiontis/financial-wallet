import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL, weekdayNames } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Point {
  day: string;
  amount: number;
  share: number;
  peak: boolean;
}

function WeekdayTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.day}>
      <TooltipRow color="var(--color-expense)" label={t("analytics.flow.expenses")} value={formatCurrency(point.amount)} />
      <TooltipRow label={t("analytics.weekday.share")} value={`${Math.round(point.share)}%`} />
    </TooltipShell>
  );
}

/**
 * The calendar next to it shows *when* money went out; this collapses the same
 * numbers onto the seven weekdays to answer *which day* — the pattern is
 * usually obvious here and invisible in a wall of squares.
 *
 * No Y axis: the exact euros belong in the tooltip, and dropping the axis buys
 * the seven bars the width they need in half a card.
 */
export default function WeekdayChart({ totals, formatCurrency, locale }: { totals: number[]; formatCurrency: (n: number) => string; locale: string }) {
  const data = useMemo<Point[]>(() => {
    const names = weekdayNames(locale);
    const sum = totals.reduce((s, v) => s + v, 0);
    const max = Math.max(...totals, 0);
    return totals.map((amount, i) => ({
      day: names[i],
      amount,
      share: sum > 0 ? (amount / sum) * 100 : 0,
      peak: amount > 0 && amount === max,
    }));
  }, [totals, locale]);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={4} interval={0} />
        <Tooltip content={<WeekdayTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
          {data.map((point) => (
            // The heaviest day carries full strength so it reads at a glance;
            // the rest stay muted rather than competing with it.
            <Cell key={point.day} fill="var(--color-expense)" fillOpacity={point.peak ? 0.9 : 0.35} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
