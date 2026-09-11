import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, GRID_STROKE, compactNumber } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

export interface NetWorthRow {
  label: string;
  cash: number;
  saved: number;
  owedToMe: number;
  /** Negative, so it draws below the line as the weight it is. */
  debt: number;
  net: number;
}

function NetWorthTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: NetWorthRow }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <TooltipShell title={row.label}>
      <TooltipRow color="var(--color-income)" label={t("analytics.netWorth.cash")} value={formatCurrency(row.cash)} />
      {row.saved !== 0 && <TooltipRow color="var(--color-invest)" label={t("analytics.netWorth.saved")} value={formatCurrency(row.saved)} />}
      {row.owedToMe !== 0 && <TooltipRow color="var(--color-goal)" label={t("analytics.netWorth.owedToMe")} value={formatCurrency(row.owedToMe)} />}
      {row.debt !== 0 && <TooltipRow color="var(--color-expense)" label={t("analytics.netWorth.owedByMe")} value={`−${formatCurrency(Math.abs(row.debt))}`} />}
      <TooltipRow color="var(--color-text-primary)" label={t("analytics.netWorth.net")} value={formatCurrency(row.net)} />
    </TooltipShell>
  );
}

/**
 * What you own against what you owe, month by month.
 *
 * Drawn as its parts rather than as one total on purpose. A single line would
 * be the more elegant chart and the less useful one: two people with the same
 * net worth, one holding it in cash and one holding a house against a mortgage,
 * are in very different positions, and the shape of the stack is what says
 * which you are. It also means an oddity in any one ledger — a debt repaid
 * without the money ever leaving the current account, say — shows up as a step
 * in that band instead of disappearing inside the sum.
 *
 * Everything owned stacks upward, what is owed hangs below the zero line, and
 * the line running across is the difference. Where the line sits relative to
 * zero is the question the chart exists to answer, so zero is always drawn.
 */
export default function NetWorthChart({ data, formatCurrency }: { data: NetWorthRow[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
        <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        <Tooltip content={<NetWorthTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />

        {/* `stackOffset="sign"` is what lets the debt band share the stack with
            the three above it and still hang the other way: same stack id,
            opposite sign. */}
        <Area type="monotone" stackId="position" dataKey="cash" name={t("analytics.netWorth.cash")} stroke="var(--color-income)" strokeWidth={1} fill="var(--color-income)" fillOpacity={0.3} dot={false} />
        <Area type="monotone" stackId="position" dataKey="saved" name={t("analytics.netWorth.saved")} stroke="var(--color-invest)" strokeWidth={1} fill="var(--color-invest)" fillOpacity={0.3} dot={false} />
        <Area type="monotone" stackId="position" dataKey="owedToMe" name={t("analytics.netWorth.owedToMe")} stroke="var(--color-goal)" strokeWidth={1} fill="var(--color-goal)" fillOpacity={0.3} dot={false} />
        <Area type="monotone" stackId="position" dataKey="debt" name={t("analytics.netWorth.owedByMe")} stroke="var(--color-expense)" strokeWidth={1} fill="var(--color-expense)" fillOpacity={0.3} dot={false} />

        <Line type="monotone" dataKey="net" name={t("analytics.netWorth.net")} stroke="var(--color-text-primary)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
