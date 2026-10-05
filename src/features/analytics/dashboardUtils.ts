import { getDaysInMonth, startOfMonth, subMonths } from "date-fns";
import type { BillWithStatus, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { isPausedOn, monthlyEquivalent } from "../bills/billsUtils";
import { lineRanges, type BudgetLine } from "../plannerPage/plannerUtils";
import { averageSavingsRate, type MonthlyFlow } from "./analyticsUtils";

// The figures behind the dashboard at the top of the Analytics page: four
// totals with last year beside them, the plan the spending is measured
// against, and the savings goal band. Everything is worked out from the
// monthly flows the rest of the page already uses, so a total here is the same
// number as the charts below it.

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── The four totals ─────────────────────────────────────────────────────────

export interface PeriodTotals {
  income: number;
  expenses: number;
  /**
   * The sum of the months' own nets — the same figure the running "net
   * position" ends on, cent for cent, rather than income − expenses rounded
   * separately.
   */
  net: number;
  /** Share of income kept, weighted by income. Undefined with no income. */
  rate?: number;
}

export function periodTotals(flows: MonthlyFlow[]): PeriodTotals {
  return {
    income: round2(flows.reduce((sum, f) => sum + f.income, 0)),
    expenses: round2(flows.reduce((sum, f) => sum + f.expenses, 0)),
    net: round2(flows.reduce((sum, f) => sum + f.net, 0)),
    rate: averageSavingsRate(flows),
  };
}

// ─── Last year ───────────────────────────────────────────────────────────────

/**
 * The same stretch a year earlier: the same months, and in the month still
 * running, only up to the same day. A whole last October against the first
 * five days of this one would say spending fell 80%.
 *
 * Undefined for "everything on record", which has no year before it.
 */
export function lastYearWindow(from: Date | null, now: Date): { from: Date; to: Date } | undefined {
  if (!from) return undefined;
  const month = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const day = Math.min(now.getDate(), getDaysInMonth(month));
  return { from: subMonths(from, 12), to: new Date(month.getFullYear(), month.getMonth(), day) };
}

/** The first month anything was recorded in — before it, "nothing" means "not using the app yet". */
export function firstRecordMonth(transactions: Transaction[]): Date | undefined {
  let first: number | undefined;
  for (const tx of transactions) {
    const time = firestoreToDate(tx.date).getTime();
    if (!Number.isNaN(time) && (first === undefined || time < first)) first = time;
  }
  return first === undefined ? undefined : startOfMonth(new Date(first));
}

/**
 * Whether last year can be compared at all: only when the records reach back
 * to its first month. Someone who started in March has a "last year" of zeros,
 * and every figure would read as a rise from nothing.
 */
export function hasLastYear(window: { from: Date } | undefined, firstMonth: Date | undefined): boolean {
  return !!window && !!firstMonth && firstMonth.getTime() <= startOfMonth(window.from).getTime();
}

/** Percentage change, one decimal. Undefined when there is nothing to change from. */
export function percentChange(current: number, previous: number): number | undefined {
  if (!(previous > 0)) return undefined;
  return round1(((current - previous) / previous) * 100);
}

// ─── The plan ────────────────────────────────────────────────────────────────

export interface PlanMonth {
  start: Date;
  /** What the plan expects the month to cost: bills plus the Planner's expense lines. */
  amount: number;
  bills: number;
  lines: number;
}

/**
 * The plan as it stands today, laid over each month: every active bill at its
 * monthly cost (from the month it starts, not while paused) and every expense
 * line of the Planner in the months its season covers.
 *
 * It is today's plan, not the one you had then — the app keeps no history of
 * plans — so it answers "does my spending fit the plan I have now?".
 *
 * The month still running is pro-rated to today: its spending so far is set
 * against the share of the plan that has had time to happen, not against all
 * of it.
 */
export function planByMonth(bills: BillWithStatus[], lines: BudgetLine[], months: Date[], now: Date): PlanMonth[] {
  const expenseLines = lines.filter((line) => line.kind === "expense" && line.amount > 0);
  const thisMonth = startOfMonth(now).getTime();

  return months.map((month) => {
    const start = startOfMonth(month);
    const days = getDaysInMonth(start);
    // Pauses are whole months; the middle of one says which side it is on.
    const middle = new Date(start.getFullYear(), start.getMonth(), 15);

    let billTotal = 0;
    for (const bill of bills) {
      if (!bill.isActive) continue;
      const since = firestoreToDate(bill.anchorDate ?? bill.createdAt);
      if (!Number.isNaN(since.getTime()) && startOfMonth(since).getTime() > start.getTime()) continue;
      if (isPausedOn(bill, middle)) continue;
      const amount = bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount;
      billTotal += monthlyEquivalent(bill, amount);
    }

    // `lineRanges` measures in days from its `today`: the month's first day,
    // over the month's own days. Seasons are whole months, so a line is either
    // in this one or not.
    const lineTotal = expenseLines.reduce((sum, line) => sum + (lineRanges(line, start, days - 1).length > 0 ? line.amount : 0), 0);

    const share = start.getTime() === thisMonth ? now.getDate() / days : 1;
    const billPart = round2(billTotal * share);
    const linePart = round2(lineTotal * share);
    return { start, bills: billPart, lines: linePart, amount: round2(billPart + linePart) };
  });
}

// ─── Labels on a line ────────────────────────────────────────────────────────

/**
 * Which points of a series carry their value: the highest, the lowest and the
 * last. A label on every point is unreadable on a phone; these three are the
 * ones a reader looks for.
 */
export function keyPoints(values: (number | null | undefined)[]): Set<number> {
  const marked = new Set<number>();
  let max = -1;
  let min = -1;
  let last = -1;
  values.forEach((value, i) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    if (max < 0 || value > (values[max] as number)) max = i;
    if (min < 0 || value < (values[min] as number)) min = i;
    last = i;
  });
  for (const i of [max, min, last]) if (i >= 0) marked.add(i);
  return marked;
}

// ─── The savings goal ────────────────────────────────────────────────────────

/** The band the user aims to save inside, in percent of income: 20–30 by their own choice. */
export interface SavingsGoal {
  min: number;
  max: number;
}

export const SAVINGS_GOAL_KEY = "analytics-savings-goal";

/** A stored goal, or undefined when it is missing or makes no sense. */
export function cleanSavingsGoal(stored: unknown): SavingsGoal | undefined {
  if (!stored || typeof stored !== "object") return undefined;
  const { min, max } = stored as Partial<SavingsGoal>;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  return min >= 0 && max <= 100 && min < max ? { min, max } : undefined;
}

export interface GoalMonths {
  /** Months with income — a month without any has no rate to judge. */
  counted: number;
  /** At or above the band's floor: the goal reached. */
  reached: number;
  inBand: number;
  above: number;
  below: number;
}

export function goalMonths(rates: (number | null)[], goal: SavingsGoal): GoalMonths {
  const result: GoalMonths = { counted: 0, reached: 0, inBand: 0, above: 0, below: 0 };
  for (const rate of rates) {
    if (rate === null || !Number.isFinite(rate)) continue;
    result.counted += 1;
    if (rate < goal.min) result.below += 1;
    else if (rate > goal.max) result.above += 1;
    else result.inBand += 1;
  }
  result.reached = result.inBand + result.above;
  return result;
}
