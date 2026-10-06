import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { SavingsGoal } from "../dashboardUtils";
import { AXIS_TICK, GRID_STROKE } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import styles from "./css/Dashboard.module.css";

interface Point {
  label: string;
  rate: number | null;
  income: number;
  net: number;
}

function RateTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <TooltipShell title={point.label}>
      <TooltipRow color="var(--chart-net)" label={t("analytics.savingsRate.rate")} value={point.rate === null ? "—" : `${Math.round(point.rate)}%`} />
      <TooltipRow color="var(--chart-income)" label={t("analytics.flow.income")} value={formatCurrency(point.income)} />
      <TooltipRow label={t("analytics.savingsRate.kept")} value={formatCurrency(point.net)} />
    </TooltipShell>
  );
}

/**
 * The share of income kept, month by month, over the band the user aims for.
 * A month under the band's floor gets a coral ring, one that reached it the
 * line's own colour — "did I make it?" is read off the dots. With no goal set
 * yet, the income-weighted average stands in, as it always has.
 *
 * Months without income carry no rate and the line breaks there: no income is
 * not the same claim as having saved nothing.
 */
export default function SavingsGoalChart({ data, goal, average, formatCurrency, compact }: { data: Point[]; goal?: SavingsGoal; average?: number; formatCurrency: (n: number) => string; compact?: boolean }) {
  const { t } = useTranslation();
  const rates = data.map((p) => p.rate).filter((r): r is number => r !== null);
  // Round tens, so the goal's 20 and 30 sit on gridlines rather than between
  // ticks of −5 and 10; twenties once the range is wide.
  const floor = Math.min(0, ...rates, goal?.min ?? 0);
  const ceiling = Math.max(10, ...rates, goal?.max ?? 0);
  const step = ceiling - floor > 80 ? 20 : 10;
  const low = Math.floor(floor / step) * step;
  const high = Math.ceil(ceiling / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        {!compact && <CartesianGrid stroke={GRID_STROKE} vertical={false} />}
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" minTickGap={12} />
        <YAxis hide={compact} domain={[low, high]} ticks={ticks} tickFormatter={(v: number) => `${Math.round(v)}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        {goal && <ReferenceArea y1={goal.min} y2={goal.max} fill="var(--chart-income)" fillOpacity={0.14} stroke="none" ifOverflow="extendDomain" />}
        <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
        {!goal && average !== undefined && (
          <ReferenceLine
            y={average}
            stroke="var(--color-text-secondary)"
            strokeDasharray="4 4"
            label={compact ? undefined : { value: t("analytics.savingsRate.average", { value: Math.round(average) }), position: "insideTopRight", fontSize: 10.5, fill: "var(--color-text-secondary)" }}
          />
        )}
        <Tooltip content={<RateTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: GRID_STROKE }} />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="var(--chart-net)"
          strokeWidth={2}
          connectNulls={false}
          activeDot={{ r: 5 }}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: Point }) => {
            const { cx, cy, index, payload } = props;
            if (cx === undefined || cy === undefined || !payload || payload.rate === null) return <g key={`dot-${index}`} />;
            const missed = goal !== undefined && payload.rate < goal.min;
            return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3.5} strokeWidth={2} stroke={missed ? "var(--chart-expense)" : "var(--chart-net)"} fill="var(--color-surface)" />;
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * The goal itself, under the chart: what it is and a way to change it, or a
 * way to set one. Two numbers the user types — the app never proposes them,
 * the same as every forward figure in the Planner.
 */
export function SavingsGoalControl({ goal, onSave }: { goal?: SavingsGoal; onSave: (goal: SavingsGoal | undefined) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [error, setError] = useState(false);

  const open = () => {
    setMin(goal ? String(goal.min) : "20");
    setMax(goal ? String(goal.max) : "30");
    setError(false);
    setEditing(true);
  };

  const save = () => {
    const from = Number(min.replace(",", "."));
    const to = Number(max.replace(",", "."));
    if (!Number.isFinite(from) || !Number.isFinite(to) || min.trim() === "" || max.trim() === "" || from < 0 || to > 100 || from >= to) {
      setError(true);
      return;
    }
    onSave({ min: from, max: to });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className={styles.goalRow}>
        <span className="text-body-secondary">{goal ? t("analytics.dashboard.goalLabel", { min: goal.min, max: goal.max }) : t("analytics.dashboard.goalNone")}</span>
        <Button color="primary" outline size="sm" onClick={open}>
          {goal ? t("analytics.dashboard.goalChange") : t("analytics.dashboard.goalSet")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className={styles.goalForm}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={styles.goalField}>
        <Label for="savings-goal-min">{t("analytics.dashboard.goalFrom")}</Label>
        <Input id="savings-goal-min" bsSize="sm" type="number" inputMode="decimal" min={0} max={100} value={min} onChange={(e) => setMin(e.target.value)} invalid={error} />
      </div>
      <div className={styles.goalField}>
        <Label for="savings-goal-max">{t("analytics.dashboard.goalTo")}</Label>
        <Input id="savings-goal-max" bsSize="sm" type="number" inputMode="decimal" min={0} max={100} value={max} onChange={(e) => setMax(e.target.value)} invalid={error} />
      </div>
      <Button type="submit" color="primary" size="sm">
        {t("common.save")}
      </Button>
      <Button type="button" color="secondary" outline size="sm" onClick={() => setEditing(false)}>
        {t("common.cancel")}
      </Button>
      {goal && (
        <Button
          type="button"
          color="danger"
          outline
          size="sm"
          onClick={() => {
            onSave(undefined);
            setEditing(false);
          }}
        >
          {t("analytics.dashboard.goalRemove")}
        </Button>
      )}
      {error && <p className={styles.goalError}>{t("analytics.dashboard.goalInvalid")}</p>}
    </form>
  );
}
