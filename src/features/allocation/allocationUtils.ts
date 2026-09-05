import { goalMonthlyTarget, type BudgetLine } from "../plannerPage/plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

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
  const debtTotal = round2(debts.filter((d) => d.direction === "owed_by_me" && !d.isSettled).reduce((sum, d) => sum + d.remaining, 0));

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

export interface AllocatedBucket extends BudgetLine {
  /** Fraction of `free`, 0–1. Zero when there is nothing free to take a share of. */
  share: number;
  /** Spread across an average month, for "€14 a day". */
  perDay: number;
}

/** Days in an average month, so a per-day figure doesn't lurch every February. */
export const DAYS_PER_MONTH = 30.44;

export function allocate(income: number, committed: Committed, lines: BudgetLine[], extra = 0): Allocation {
  // Only outgoing lines are buckets. An income line the user added in the
  // planner ("room rent, €150") is money arriving, so it joins the pot instead
  // of competing for it.
  const extraIncome = lines.filter((l) => l.kind === "income").reduce((sum, l) => sum + l.amount, 0);
  const buckets = lines.filter((l) => l.kind === "expense");

  const free = round2(income + extraIncome - committed.total - extra);
  const allocated = round2(buckets.reduce((sum, b) => sum + b.amount, 0));

  return {
    income: round2(income + extraIncome),
    committed,
    extra: round2(extra),
    free,
    allocated,
    unallocated: round2(free - allocated),
    buckets: buckets.map((bucket) => ({
      ...bucket,
      share: free > 0 ? bucket.amount / free : 0,
      perDay: round2(bucket.amount / DAYS_PER_MONTH),
    })),
  };
}

// ─── Presets ────────────────────────────────────────────────────────────────

/**
 * Starting points, not advice.
 *
 * Every one of these divides `free`, never the salary, so none of them can
 * suggest something the month cannot afford. They exist to save the blank
 * page — the first figure is always the hardest — and every row is meant to be
 * dragged afterwards.
 */
export interface Preset {
  id: string;
  /** Label key under `allocation.presets`. */
  buckets: { labelKey: string; weight: number }[];
}

export const PRESETS: Preset[] = [
  {
    // An even hand: day-to-day first, with a real share put away.
    id: "balanced",
    buckets: [
      { labelKey: "food", weight: 0.4 },
      { labelKey: "life", weight: 0.2 },
      { labelKey: "shopping", weight: 0.15 },
      { labelKey: "investing", weight: 0.2 },
      { labelKey: "buffer", weight: 0.05 },
    ],
  },
  {
    // Savings as the first bill rather than the leftover, which is the whole
    // point of the idea — what is left over is reliably nothing.
    id: "payYourselfFirst",
    buckets: [
      { labelKey: "investing", weight: 0.3 },
      { labelKey: "food", weight: 0.35 },
      { labelKey: "life", weight: 0.15 },
      { labelKey: "shopping", weight: 0.1 },
      { labelKey: "buffer", weight: 0.1 },
    ],
  },
  {
    // A tight month: essentials and a cushion, nothing else pretending.
    id: "tight",
    buckets: [
      { labelKey: "food", weight: 0.55 },
      { labelKey: "life", weight: 0.15 },
      { labelKey: "buffer", weight: 0.3 },
    ],
  },
];

/**
 * Turns a preset into real amounts that add up to `free` exactly.
 *
 * The last bucket carries the rounding rather than each one absorbing a
 * fraction of a cent, so the total lands on the pot and the page does not open
 * by announcing that three cents are unaccounted for.
 */
export function applyPreset(preset: Preset, free: number, labelFor: (key: string) => string, newId: () => string): BudgetLine[] {
  if (free <= 0) return [];

  let running = 0;
  return preset.buckets.map((bucket, i) => {
    const isLast = i === preset.buckets.length - 1;
    const amount = isLast ? round2(free - running) : round2(free * bucket.weight);
    running = round2(running + amount);
    return { id: newId(), label: labelFor(bucket.labelKey), amount, kind: "expense" as const };
  });
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
export function setBucketAmount(lines: BudgetLine[], id: string, amount: number, free: number): BudgetLine[] {
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
export function assignRemainder(lines: BudgetLine[], id: string, unallocated: number): BudgetLine[] {
  if (unallocated === 0) return lines;
  return lines.map((l) => (l.id === id ? { ...l, amount: Math.max(0, round2(l.amount + unallocated)) } : l));
}
