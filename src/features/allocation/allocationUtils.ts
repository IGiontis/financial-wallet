import { addDays, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { currentRate, isLoan, monthlyInstalment } from "../debts/debtsUtils";
import { goalMonthlyTarget, oneOffDates, type BudgetLine, type OneOff } from "../plannerPage/plannerUtils";
import { categorySplit } from "../transactions/transactionInsights";
import type { BillWithStatus, Category, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

/**
 * Dividing what is left, rather than dividing the salary.
 *
 * The rules of thumb all start from income — 50/30/20 takes half your pay for
 * "needs" — which is a number written for a different country and a different
 * cost of living. On a salary where rent and bills already claim most of it,
 * a percentage of the whole is either impossible or insulting.
 *
 * So the pot here is what genuinely remains once the unavoidable is out:
 *
 *     income − bills − goals − debts = free
 *
 * and `free` is what gets divided. The percentages are of that, not of the
 * salary, so they stay honest whatever the salary is.
 *
 * Committed money is read from what the app already knows — every bill's
 * monthly equivalent, every goal's monthly target — while the division of what
 * is left is entirely the user's, entered by hand and adjustable per row. That
 * split is deliberate: the app is allowed to say what is already spoken for,
 * and never to say what someone ought to eat.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What one debt claims from *this* month.
 *
 * The whole remaining balance is the wrong figure, and it was the one being
 * used: a €655 loan due next June was taken out of this month's pot in full,
 * which is how a perfectly solvent month came to show €229 available. The
 * planner never made that mistake — it charges a debt on its due date — but
 * this screen divides a month rather than walking a window, so it needs the
 * monthly share instead.
 *
 * Spread evenly over the months left until it is due. With no due date there
 * is nothing to spread across and no date to wait for, so it stands as owed
 * now — which is also the honest reading of a loan with no agreed date.
 */
export function debtMonthlyShare(debt: Pick<DebtWithStatus, "remaining" | "dueDate" | "amount" | "interestRate" | "termMonths" | "interestFreeMonths" | "rateType" | "baseRate" | "margin">, now: Date = new Date()): number {
  // A loan already has a monthly figure, set by whoever lent the money. Spreading
  // its balance over the months to the final date would invent a different one —
  // and a lower one, since the balance ignores the interest still to come.
  if (isLoan(debt)) return monthlyInstalment(debt.amount, currentRate(debt), debt.termMonths ?? 0, debt.interestFreeMonths ?? 0);

  if (!debt.dueDate) return round2(debt.remaining);

  const due = firestoreToDate(debt.dueDate);
  const monthsLeft = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());

  // Due this month, or the day has gone: all of it, now.
  if (monthsLeft <= 0) return round2(debt.remaining);
  return round2(debt.remaining / (monthsLeft + 1));
}

export interface Committed {
  bills: number;
  goals: number;
  debts: number;
  total: number;
}

/** What is already spoken for each month, before anything is decided. */
export function committedMonthly(bills: BillWithStatus[], goals: InvestmentGoalWithStats[], debts: DebtWithStatus[], now: Date = new Date()): Committed {
  const billTotal = round2(bills.filter((b) => b.isActive).reduce((sum, b) => sum + b.monthlyEquivalent, 0));
  const goalTotal = round2(goals.reduce((sum, g) => sum + goalMonthlyTarget(g, now), 0));

  // Only what you owe. Money owed *to* you is not income until it arrives, the
  // same rule the planner and the debts page already follow.
  const debtTotal = round2(debts.filter((d) => d.direction === "owed_by_me" && !d.isSettled).reduce((sum, d) => sum + debtMonthlyShare(d, now), 0));

  return { bills: billTotal, goals: goalTotal, debts: debtTotal, total: round2(billTotal + goalTotal + debtTotal) };
}

/**
 * A one-off claim on this month only — "I want to put €200 extra away in
 * September".
 *
 * Stamped with the month it belongs to and ignored once that month is over, so
 * it cannot quietly go on shrinking the pot for ever. It comes off the top like
 * a bill rather than editing the buckets: the standing plan is what you decided
 * once, and one unusual month should not require rewriting it and then
 * remembering to put it back.
 */
export interface ExtraThisMonth {
  /** "2026-09" */
  month: string;
  label: string;
  amount: number;
}

export const monthKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** The amount only counts while its month is the current one. */
export function extraFor(extra: ExtraThisMonth | null | undefined, now: Date = new Date()): number {
  if (!extra || extra.month !== monthKey(now) || !Number.isFinite(extra.amount)) return 0;
  return Math.max(0, round2(extra.amount));
}

export interface Allocation {
  income: number;
  committed: Committed;
  /** Taken off the top this month only. */
  extra: number;
  /** income − committed. Negative means the commitments alone overrun the pay. */
  free: number;
  /** Sum of the buckets. */
  allocated: number;
  /** free − allocated. Zero is the goal; anything else is unfinished. */
  unallocated: number;
  buckets: AllocatedBucket[];
}

export interface AllocatedBucket extends Bucket {
  /** Fraction of `free`, 0–1. Zero when there is nothing free to take a share of. */
  share: number;
  /** Spread across an average month, for "€14 a day". */
  perDay: number;
}

/** Days in an average month, so a per-day figure doesn't lurch every February. */
export const DAYS_PER_MONTH = 30.44;

export function allocate(income: number, committed: Committed, lines: Bucket[], extra = 0): Allocation {
  // Only outgoing lines are buckets. An income line the user added in the
  // planner ("room rent, €150") is money arriving, so it joins the pot instead
  // of competing for it.
  const extraIncome = lines.filter((l) => l.kind === "income").reduce((sum, l) => sum + l.amount, 0);
  const buckets = lines.filter((l) => l.kind === "expense");

  const free = round2(income + extraIncome - committed.total - extra);
  const allocated = round2(buckets.reduce((sum, b) => sum + b.amount, 0));
  const denominator = Math.max(free, allocated);

  return {
    income: round2(income + extraIncome),
    committed,
    extra: round2(extra),
    free,
    allocated,
    unallocated: round2(free - allocated),
    // Shares are of whichever is larger, the pot or what has been put in it.
    //
    // Against `free` alone they lied whenever the pot shrank underneath them —
    // add a bill, add a debt, take something off the top for this month, and
    // buckets set when there was more to go round keep their amounts while the
    // denominator falls. The page then showed 89% + 24% + 48% and a bar with
    // slices hanging off the end of it. Dividing by the larger figure keeps
    // every share a real fraction of the bar being drawn; the over-allocation
    // itself is reported by `unallocated` going negative, which is where a
    // reader should hear about it.
    buckets: buckets.map((bucket) => ({
      ...bucket,
      share: denominator > 0 ? bucket.amount / denominator : 0,
      perDay: round2(bucket.amount / DAYS_PER_MONTH),
    })),
  };
}

// ─── Setting a bucket ───────────────────────────────────────────────────────

/**
 * Sets one bucket, and refuses to spend money that is not there.
 *
 * An earlier version took the difference out of the other buckets in
 * proportion, so the total always sat exactly on the pot. It made the trade
 * visible — and it hid the one number the reader was actually watching, because
 * the leftover never moved off zero. Worse, sliding one row silently rewrote
 * rows nobody had touched.
 *
 * So each bucket is now simply what it was set to. The ceiling is what is left
 * beside it, which is what stops the buckets from adding up to more than the
 * month holds: you cannot allocate the same euro twice.
 */
export function setBucketAmount<T extends BudgetLine>(lines: T[], id: string, amount: number, free: number): T[] {
  const target = lines.find((l) => l.id === id);
  if (!target || target.kind !== "expense") return lines;

  const others = lines.filter((l) => l.kind === "expense" && l.id !== id).reduce((sum, l) => sum + l.amount, 0);
  const ceiling = Math.max(0, round2(free - others));
  const next = Math.max(0, Math.min(round2(amount), ceiling));

  return lines.map((l) => (l.id === id ? { ...l, amount: next } : l));
}

/** The most this bucket could take without overspending the month. */
export function bucketCeiling(lines: BudgetLine[], id: string, free: number): number {
  const others = lines.filter((l) => l.kind === "expense" && l.id !== id).reduce((sum, l) => sum + l.amount, 0);
  return Math.max(0, round2(free - others));
}

/** Hands whatever is unallocated to one bucket, so the pot reaches zero. */
export function assignRemainder<T extends BudgetLine>(lines: T[], id: string, unallocated: number): T[] {
  if (unallocated === 0) return lines;
  return lines.map((l) => (l.id === id ? { ...l, amount: Math.max(0, round2(l.amount + unallocated)) } : l));
}

// ─── Buckets that know what they pay for ────────────────────────────────────

/**
 * A bucket, and the categories it covers.
 *
 * Without the link, the label was the only thing tying a bucket called "Food"
 * to the money actually leaving under Groceries and Dining Out — which is to
 * say nothing tied them, and the page could never find out whether a plan had
 * survived contact with the month. A budget that is never compared with what
 * happened is a wish list you rewrite every month.
 *
 * Optional, because an existing bucket has no categories until someone picks
 * them, and a bucket for something the ledger does not track may never get any.
 * Those are reported as unmeasured rather than as having spent nothing, which
 * would be a guess dressed as a fact.
 */
export interface Bucket extends BudgetLine {
  categoryIds?: string[];
}

/** What actually left, per category, between two dates. */
export function spentByCategory(transactions: Transaction[], from: Date, to: Date): Map<string, number> {
  const inRange = transactions.filter((tx) => {
    const date = firestoreToDate(tx.date);
    return date >= from && date <= to;
  });

  // Through `categorySplit` rather than a fresh sum: it already knows that a
  // goal deposit is a transfer and not spending, and a second opinion on that
  // is the last thing this app needs.
  return new Map(categorySplit(inRange, "expense", Number.MAX_SAFE_INTEGER).map((slice) => [slice.categoryId, slice.amount]));
}

export interface BucketActual {
  spent: number;
  /** What the bucket still holds: amount + rollover − spent. Negative is over. */
  left: number;
  /** Fraction of the bucket used. Can exceed 1. */
  used: number;
  /** No categories linked, so nothing about it can be measured. */
  unmeasured: boolean;
}

export function bucketActual(bucket: Bucket, spent: Map<string, number>, rollover = 0): BucketActual {
  const ids = bucket.categoryIds ?? [];
  const budget = round2(bucket.amount + rollover);

  if (ids.length === 0) return { spent: 0, left: budget, used: 0, unmeasured: true };

  const used = round2(ids.reduce((sum, id) => sum + (spent.get(id) ?? 0), 0));
  return { spent: used, left: round2(budget - used), used: budget > 0 ? used / budget : used > 0 ? Infinity : 0, unmeasured: false };
}

// ─── Rollover ───────────────────────────────────────────────────────────────

/**
 * What each bucket carries into the next month.
 *
 * This is what makes envelopes work rather than merely look like envelopes: a
 * month where you held back on food should leave you better off in the next
 * one. Without it every month restarts from zero, restraint is never rewarded,
 * and that is the quickest way to stop bothering.
 *
 * Overspending does not carry forward as a negative. It is real, and the month
 * it happened in reports it — but starting January in a hole dug in December
 * compounds into a number nobody can act on, and the money to cover it came
 * from somewhere else at the time.
 *
 * An unmeasured bucket carries nothing. Carrying its full amount would be the
 * app asserting that nothing was spent, which it has no way to know.
 */
export interface RolloverState {
  /** The month the balances below are the opening position *for*. */
  month: string;
  byBucket: Record<string, number>;
}

export function nextRollover(buckets: Bucket[], carriedIn: Record<string, number>, spent: Map<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const bucket of buckets) {
    const actual = bucketActual(bucket, spent, carriedIn[bucket.id] ?? 0);
    if (actual.unmeasured) continue;
    const left = Math.max(0, actual.left);
    if (left > 0) next[bucket.id] = left;
  }
  return next;
}

// ─── Pay beyond the twelve ──────────────────────────────────────────────────

/**
 * How a fourteenth salary reaches a monthly plan.
 *
 * "when" puts it in the month it lands, which is what the bank statement will
 * say. "spread" divides the next twelve months' worth evenly, which is the
 * conventional handling of pay that arrives in lumps — the alternative being a
 * December that can afford anything and a January that cannot.
 *
 * Neither is inherently right, so it is a switch rather than a decision taken
 * here. What is certainly wrong is the previous behaviour: ignoring extra pay
 * altogether, which understated a year by the whole of it.
 */
export type ExtraPayMode = "when" | "spread";

export function extraPayForMonth(oneOffs: OneOff[], mode: ExtraPayMode, now: Date = new Date()): number {
  // Every time each entry lands in the window, not just the day it was entered
  // on: a coupon every three months is four arrivals a year, and counting one
  // of them understates the year by three quarters of it.
  const landing = (from: Date, to: Date) =>
    round2(oneOffs.filter((o) => Number.isFinite(o.amount)).reduce((sum, o) => sum + oneOffDates(o, from, to).length * o.amount, 0));

  if (mode === "when") return landing(startOfMonth(now), endOfMonth(now));

  // A year ahead of today, so the figure does not lurch on 1 January.
  const horizon = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  return round2(landing(startOfMonth(now), addDays(horizon, -1)) / 12);
}

// ─── Emergency fund ─────────────────────────────────────────────────────────

/** Months of committed costs worth holding in cash. A common convention, not advice. */
export const EMERGENCY_MONTHS = 3;

/**
 * What a cushion would need to be, from figures the app already has.
 *
 * Measured against committed costs rather than against income: what a bad month
 * has to cover is the rent and the bills, not the salary that did not arrive.
 */
export function emergencyTarget(committed: Committed, months: number = EMERGENCY_MONTHS): number {
  return round2(committed.total * Math.max(1, months));
}

// ─── Starting from what actually happens ────────────────────────────────────

/**
 * Buckets seeded from real spending, one per category.
 *
 * This replaced three percentage presets. A preset divides the leftovers by a
 * rule of thumb written for a different country — 40% of 229 is 92, which is
 * not a food budget but a number — and worse, it looks like advice. What a
 * month costs is not a matter of opinion when the ledger already knows: the
 * average of the last few complete months is personal, true, and a far better
 * first draft than any fraction.
 *
 * Complete months only. Including the one in progress would halve every figure
 * on the 15th.
 */
export function seedFromHistory(
  transactions: Transaction[],
  categories: Category[],
  newId: () => string,
  now: Date = new Date(),
  months: number = 3,
): Bucket[] {
  const span = Math.max(1, months);
  const from = startOfMonth(subMonths(now, span));
  const to = endOfMonth(subMonths(now, 1));

  const spent = spentByCategory(transactions, from, to);
  const byId = new Map(categories.map((c) => [c.id, c]));

  return Array.from(spent.entries())
    .map(([categoryId, total]) => ({ categoryId, monthly: round2(total / span), category: byId.get(categoryId) }))
    // A category averaging under a euro a month is noise, and a bucket for it
    // costs more attention than the money it holds.
    .filter((row) => row.monthly >= 1 && !!row.category)
    .sort((a, b) => b.monthly - a.monthly)
    .map((row) => ({
      id: newId(),
      label: row.category!.name,
      amount: row.monthly,
      kind: "expense" as const,
      categoryIds: [row.categoryId],
    }));
}
