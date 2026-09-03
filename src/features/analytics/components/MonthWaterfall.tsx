import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { AXIS_TICK, CURSOR_FILL } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import type { WaterfallStep } from "../analyticsUtils";

interface Point extends WaterfallStep {
  name: string;
  /** Invisible pedestal that floats the visible bar at the right height. */
  base: number;
  size: number;
}

function StepTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <TooltipShell title={point.name}>
      <TooltipRow
        color={point.kind === "expense" ? "var(--color-expense)" : "var(--color-income)"}
        label={point.kind === "expense" ? t("analytics.flow.expenses") : t("analytics.flow.income")}
        value={formatCurrency(Math.abs(point.amount))}
      />
      {point.kind === "expense" && <TooltipRow label={t("analytics.waterfall.left")} value={formatCurrency(point.balance)} />}
    </TooltipShell>
  );
}

/**
 * Income, then each big category taken off it, then what survived.
 *
 * Floating bars on one baseline: every step is measured against the same axis,
 * so "which of these took the most" is a comparison of two heights. The Sankey
 * beside it shows the same money as ribbons, which is better at showing that
 * everything connects and worse at saying which is bigger.
 */
export default function MonthWaterfall({ steps, nameFor, formatCurrency }: { steps: WaterfallStep[]; nameFor: (id: string) => string; formatCurrency: (n: number) => string }) {
  const data = useMemo<Point[]>(
    () =>
      steps.map((step) => ({
        ...step,
        name: nameFor(step.id),
        // A cost hangs from where the running total was down to where it now
        // is; income and the remainder stand on the floor.
        base: step.kind === "expense" ? step.balance : 0,
        size: Math.abs(step.amount),
      })),
    [steps, nameFor],
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="18%">
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} height={30} />
        <ReferenceLine y={0} stroke="var(--color-border-primary)" />
        <Tooltip content={<StepTooltip formatCurrency={formatCurrency} />} cursor={CURSOR_FILL} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="size" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((step) => (
            <Cell
              key={step.id}
              fill={step.kind === "income" ? "var(--color-income)" : step.kind === "result" ? "var(--bs-primary)" : "var(--color-expense)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
