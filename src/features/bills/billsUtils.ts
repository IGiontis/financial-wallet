import { getISOWeek, getISOWeekYear, startOfWeek, differenceInCalendarWeeks, addWeeks, addMonths, addYears } from "date-fns";
import type { Bill, BillFrequency, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";

// ─── Interval helpers ────────────────────────────────────────────────────────
// A bill repeats every `intervalCount` periods of `frequency` — e.g. water every
// 2 months, gym every 4, Netflix every 3. Buckets are anchored to the bill's
// anchorDate (falling back to createdAt) so "every 2 months" always lands on the
// same pair of months rather than drifting with the calendar.

export const getIntervalCount = (bill: Pick<Bill, "intervalCount">) => Math.max(1, Math.round(bill.intervalCount ?? 1));

const getAnchor = (bill: Pick<Bill, "anchorDate" | "createdAt">): Date => firestoreToDate(bill.anchorDate ?? bill.createdAt);

/** First day of the period bucket that `date` falls into. */
export function getPeriodStart(bill: Pick<Bill, "frequency" | "intervalCount" | "anchorDate" | "createdAt">, date: Date): Date {
  const interval = getIntervalCount(bill);
  const anchor = getAnchor(bill);

  switch (bill.frequency) {
    case "monthly": {
      const anchorMonths = anchor.getFullYear() * 12 + anchor.getMonth();
      const dateMonths = date.getFullYear() * 12 + date.getMonth();
      const bucket = Math.floor((dateMonths - anchorMonths) / interval);
      return addMonths(new Date(anchor.getFullYear(), anchor.getMonth(), 1), bucket * interval);
    }
    case "yearly": {
      const bucket = Math.floor((date.getFullYear() - anchor.getFullYear()) / interval);
      return addYears(new Date(anchor.getFullYear(), 0, 1), bucket * interval);
    }
    case "weekly": {
      const anchorWeekStart = startOfWeek(anchor, { weekStartsOn: 1 });
      const weeksSince = differenceInCalendarWeeks(date, anchorWeekStart, { weekStartsOn: 1 });
      const bucket = Math.floor(weeksSince / interval);
      return addWeeks(anchorWeekStart, bucket * interval);
    }
  }
}

// ─── Period keys ────────────────────────────────────────────────────────────
// A bill is "paid this period" when a payment exists for the key of the period
// the given date falls in. Keys are derived from the bucket start, so for
// interval = 1 they match the plain calendar keys used before intervals existed.

export function getPeriodKey(bill: Pick<Bill, "frequency" | "intervalCount" | "anchorDate" | "createdAt">, date: Date): string {
  const start = getPeriodStart(bill, date);
  switch (bill.frequency) {
    case "monthly":
      return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    case "yearly":
      return `${start.getFullYear()}`;
    case "weekly":
      // ISO week — the week-year can differ from the calendar year around Jan 1.
      return `${getISOWeekYear(start)}-W${String(getISOWeek(start)).padStart(2, "0")}`;
  }
}

export function getCurrentPeriodKey(bill: Pick<Bill, "frequency" | "intervalCount" | "anchorDate" | "createdAt">, now: Date = new Date()): string {
  return getPeriodKey(bill, now);
}

// ─── Next due date ──────────────────────────────────────────────────────────
// A soft hint for "roughly when I expect it". Undefined when the user left the
// due day blank.

/**
 * Due date of the period `date` falls in, whether or not it has already gone
 * past. `getNextDueDate` rolls forward once the day is behind us, which is
 * right for "when is it next due" but hides the payment that is late — or, for
 * a bill with grace, still perfectly payable.
 */
export function getPeriodDueDate(bill: Bill, date: Date = new Date()): Date | undefined {
  const { frequency, dueDay, dueMonth } = bill;
  if (dueDay == null) return undefined; // weekly: dueDay holds the weekday (0–6)

  const periodStart = getPeriodStart(bill, date);
  if (frequency === "weekly") return weekdayWithin(periodStart, dueDay);
  if (frequency === "monthly") return clampDayOfMonth(periodStart.getFullYear(), periodStart.getMonth(), dueDay);

  if (dueMonth == null) return undefined;
  return clampDayOfMonth(periodStart.getFullYear(), dueMonth, dueDay);
}

export function getNextDueDate(bill: Bill, now: Date = new Date(), skipCurrentPeriod = false): Date | undefined {
  const candidate = getPeriodDueDate(bill, now);
  if (candidate === undefined) return undefined;
  if (!skipCurrentPeriod && candidate >= startOfDay(now)) return candidate;

  const interval = getIntervalCount(bill);
  const periodStart = getPeriodStart(bill, now);

  switch (bill.frequency) {
    case "weekly":
      return weekdayWithin(addWeeks(periodStart, interval), bill.dueDay!);
    case "monthly": {
      const next = addMonths(periodStart, interval);
      return clampDayOfMonth(next.getFullYear(), next.getMonth(), bill.dueDay!);
    }
    case "yearly":
      return clampDayOfMonth(periodStart.getFullYear() + interval, bill.dueMonth!, bill.dueDay!);
  }
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// ─── Deadline ───────────────────────────────────────────────────────────────
// The due date is when a bill *lands*; the deadline is the last day the money
// has to be there. For most utilities those are weeks apart — electricity is
// issued and then payable for another few weeks — while a subscription has no
// gap at all: miss the day and it stops. Planning cash against the due date
// alone therefore either panics you early or catches you out late.

/** Days of slack after the due date. 0 = the payment cannot be late at all. */
export const getGraceDays = (bill: Pick<Bill, "graceDays">) => Math.max(0, Math.round(bill.graceDays ?? 0));

/** True when missing the day has immediate consequences (subscriptions). */
export const isHardDeadline = (bill: Pick<Bill, "graceDays">) => getGraceDays(bill) === 0;

export function getDeadline(bill: Pick<Bill, "graceDays">, nextDueDate: Date | undefined): Date | undefined {
  if (!nextDueDate) return undefined;
  const grace = getGraceDays(bill);
  if (grace === 0) return nextDueDate;
  const r = new Date(nextDueDate);
  r.setDate(r.getDate() + grace);
  return r;
}

/** The given weekday (0=Sun…6=Sat) inside the week that starts at `weekStart`. */
function weekdayWithin(weekStart: Date, weekday: number): Date {
  const mondayBased = (weekday + 6) % 7; // Monday-started weeks
  const r = new Date(weekStart);
  r.setDate(weekStart.getDate() + mondayBased);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Handles months that don't have the requested day (e.g. day 31 in February).
function clampDayOfMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

// ─── Monthly-equivalent cost ────────────────────────────────────────────────
// Normalizes every frequency AND interval to a per-month figure, so the overview
// can total a €60 bill every 2 months alongside a €15 monthly one.

export function monthlyEquivalent(bill: Bill, effectiveAmount?: number): number {
  const interval = getIntervalCount(bill);
  const amount = effectiveAmount ?? bill.amount;
  switch (bill.frequency) {
    case "monthly":
      return amount / interval;
    case "weekly":
      return (amount * 52) / 12 / interval;
    case "yearly":
      return amount / 12 / interval;
  }
}

// ─── Average of real payments ────────────────────────────────────────────────
// Variable bills (electricity, water) are stored with an estimate, so recent
// actuals give a far better forecast. Undefined until something has been paid.

const AVERAGE_WINDOW = 6;

export function averagePaidAmount(payments: BillPayment[]): number | undefined {
  if (payments.length === 0) return undefined;
  const recent = payments.slice(0, AVERAGE_WINDOW);
  return recent.reduce((sum, p) => sum + p.amount, 0) / recent.length;
}

/**
 * Cheapest and dearest of the recent payments — answers "what do I usually pay?"
 * better than an average alone for a bill that swings (€80 in spring, €122 in
 * winter). Undefined until there's history; `min === max` once there is only
 * one distinct figure, which callers render as a single amount.
 */
export function paidAmountRange(payments: BillPayment[]): { min: number; max: number } | undefined {
  if (payments.length === 0) return undefined;
  const recent = payments.slice(0, AVERAGE_WINDOW).map((p) => p.amount);
  return { min: Math.min(...recent), max: Math.max(...recent) };
}

// ─── Status ─────────────────────────────────────────────────────────────────

function computeStatusInternal(bill: Bill, allPayments: BillPayment[], now: Date = new Date()): BillWithStatus {
  const payments = allPayments
    .filter((p) => p.billId === bill.id)
    .sort((a, b) => firestoreToDate(b.paidDate).getTime() - firestoreToDate(a.paidDate).getTime());

  const currentPeriodKey = getCurrentPeriodKey(bill, now);
  const payment = payments.find((p) => p.periodKey === currentPeriodKey);

  // For variable bills, forecast from what has actually been paid rather than
  // the (necessarily rough) stored estimate.
  const average = averagePaidAmount(payments);
  const forecastAmount = bill.isVariableAmount ? (average ?? bill.amount) : bill.amount;
  const nextDueDate = getNextDueDate(bill, now, !!payment);

  return {
    ...bill,
    currentPeriodKey,
    isPaidThisPeriod: !!payment,
    payment,
    payments,
    averagePaidAmount: average,
    paidAmountRange: paidAmountRange(payments),
    lastPaidDate: payments[0] ? firestoreToDate(payments[0].paidDate) : undefined,
    nextDueDate,
    deadline: getDeadline(bill, nextDueDate),
    monthlyEquivalent: monthlyEquivalent(bill, forecastAmount),
  };
}

/**
 * A bill with a grace period is not "next due" the moment its due date passes —
 * it is still payable, and only rolls to the following period once the grace
 * has run out too. Recomputing with `skipCurrentPeriod` forced off keeps an
 * unpaid electricity bill visible for the whole window it can still be paid in.
 */
/**
 * An unpaid bill points at *this* period's payment, even once the day has gone.
 *
 * `getNextDueDate` rolls forward the moment the date passes, which is right for
 * "when does it come round again" but wrong for an outstanding bill: a
 * subscription missed on the 10th would quietly re-advertise itself as due in
 * three weeks, so nothing on the screen ever said you owed it. The period
 * bucket still governs the roll-over — once the month turns, this returns the
 * new month's date on its own.
 */
export function computeBillStatus(bill: Bill, allPayments: BillPayment[], now: Date = new Date()): BillWithStatus {
  const status = computeStatusInternal(bill, allPayments, now);
  if (status.isPaidThisPeriod) return status;

  const periodDue = getPeriodDueDate(bill, now);
  if (!periodDue) return status;

  return { ...status, nextDueDate: periodDue, deadline: getDeadline(bill, periodDue) };
}

// ─── Grouping by urgency ────────────────────────────────────────────────────
// The list is split into overdue / upcoming / paid so the things that need
// attention sit at the top instead of being buried in one flat list.

export type BillGroup = "overdue" | "upcoming" | "paid";

/** Whole days until the next due date. Negative = that many days late. */
export function daysUntilDue(bill: BillWithStatus, now: Date = new Date()): number | undefined {
  if (!bill.nextDueDate) return undefined;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = bill.nextDueDate;
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return Math.round((startOfDue - startOfToday) / 86_400_000);
}

export function getBillGroup(bill: BillWithStatus, now: Date = new Date()): BillGroup {
  if (bill.isPaidThisPeriod) return "paid";
  const days = daysUntilDeadline(bill, now);
  // No due date set → it can't be late, so treat it as upcoming.
  return days !== undefined && days < 0 ? "overdue" : "upcoming";
}

// ─── Urgency ────────────────────────────────────────────────────────────────

/** Whole days until the money must actually be there. Negative = truly late. */
export function daysUntilDeadline(bill: BillWithStatus, now: Date = new Date()): number | undefined {
  if (!bill.deadline) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(bill.deadline.getFullYear(), bill.deadline.getMonth(), bill.deadline.getDate()).getTime();
  return Math.round((end - today) / 86_400_000);
}

/** Inside its grace window: the day has passed but it can still be paid. */
export function isInGracePeriod(bill: BillWithStatus, now: Date = new Date()): boolean {
  if (bill.isPaidThisPeriod || isHardDeadline(bill)) return false;
  const toDue = daysUntilDue(bill, now);
  const toDeadline = daysUntilDeadline(bill, now);
  return toDue !== undefined && toDeadline !== undefined && toDue < 0 && toDeadline >= 0;
}

export type BillUrgency = "paid" | "late" | "soon" | "later";

/** Within this many days of the deadline a bill counts as needing attention. */
export const URGENT_DAYS = 7;

/**
 * One four-way answer to "where does this stand?", measured against the
 * deadline rather than the due date — an electricity bill three days past its
 * due date with three weeks of grace left is not in trouble, and shouldn't be
 * coloured as if it were.
 */
export function billUrgency(bill: BillWithStatus, now: Date = new Date()): BillUrgency {
  if (bill.isPaidThisPeriod) return "paid";
  const days = daysUntilDeadline(bill, now);
  if (days === undefined) return "later";
  if (days < 0) return "late";
  return days <= URGENT_DAYS ? "soon" : "later";
}

/** Colour token per state — the same scale the rows and the runway share. */
export function urgencyToken(urgency: BillUrgency): string {
  switch (urgency) {
    case "paid":
      return "--color-income";
    case "late":
      return "--color-expense";
    case "soon":
      return "--color-goal";
    default:
      return "--bs-primary";
  }
}

// ─── Period progress ────────────────────────────────────────────────────────
// How far a bill has travelled from its last due date toward its next one —
// a continuous line that fills in a little more every day, rather than a
// binary paid/unpaid flag. Independent of payment status: a bill that was
// just paid still shows the countdown ticking down toward the next one.

/** Fraction (0–1) of the way from the previous due date to `nextDueDate`. */
export function periodProgress(bill: Pick<Bill, "frequency" | "intervalCount">, nextDueDate: Date | undefined, now: Date = new Date()): number | undefined {
  if (!nextDueDate) return undefined;
  const interval = getIntervalCount(bill);

  let previousDueDate: Date;
  switch (bill.frequency) {
    case "weekly":
      previousDueDate = addWeeks(nextDueDate, -interval);
      break;
    case "monthly":
      previousDueDate = addMonths(nextDueDate, -interval);
      break;
    case "yearly":
      previousDueDate = addYears(nextDueDate, -interval);
      break;
  }

  const cycleMs = nextDueDate.getTime() - previousDueDate.getTime();
  if (cycleMs <= 0) return undefined;
  const elapsedMs = now.getTime() - previousDueDate.getTime();
  return Math.min(1, Math.max(0, elapsedMs / cycleMs));
}

export interface GroupedBills {
  overdue: BillWithStatus[];
  upcoming: BillWithStatus[];
  paid: BillWithStatus[];
}

/** Splits bills into the three sections, each sorted by urgency. */
export function groupBills(bills: BillWithStatus[], now: Date = new Date()): GroupedBills {
  const groups: GroupedBills = { overdue: [], upcoming: [], paid: [] };

  for (const bill of bills) {
    groups[getBillGroup(bill, now)].push(bill);
  }

  // Most overdue first; soonest deadline first; most recently paid first.
  const byDays = (a: BillWithStatus, b: BillWithStatus) =>
    (daysUntilDeadline(a, now) ?? Number.MAX_SAFE_INTEGER) - (daysUntilDeadline(b, now) ?? Number.MAX_SAFE_INTEGER);
  groups.overdue.sort(byDays);
  groups.upcoming.sort(byDays);
  groups.paid.sort((a, b) => (b.lastPaidDate?.getTime() ?? 0) - (a.lastPaidDate?.getTime() ?? 0));

  return groups;
}

/** Amount a bill is expected to cost — the recent average for variable bills. */
export const expectedAmount = (bill: BillWithStatus) => (bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);

// ─── Cash runway ────────────────────────────────────────────────────────────
// "How much do I need to have, and by when?" — the question a list of bills
// can't answer on its own. Each checkpoint is a real deadline date carrying a
// running total, so the answer is a date and a figure rather than a sum the
// user has to do in their head.

export interface CashCheckpoint {
  /** Last day the money has to be in place. */
  date: Date;
  bills: BillWithStatus[];
  /** Falling due on this date alone. */
  amount: number;
  /** Everything from today through this date. */
  cumulative: number;
  /** How many bills that running total covers. */
  cumulativeCount: number;
  /** How many of the cumulative set cannot be paid a day late. */
  strictCount: number;
  /** True when this checkpoint carries bills whose deadline has already gone. */
  overdue: boolean;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function cashRunway(bills: BillWithStatus[], now: Date = new Date(), limit = 3): CashCheckpoint[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const pending = bills.filter((b) => b.isActive && !b.isPaidThisPeriod && b.deadline);

  const byDate = new Map<string, CashCheckpoint>();
  for (const bill of pending) {
    // Anything already past its deadline is needed *now*, not on a date that
    // has been and gone — so it collapses onto today's checkpoint.
    const raw = bill.deadline!;
    const date = raw < today ? today : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());

    const entry = byDate.get(dayKey(date)) ?? { date, bills: [], amount: 0, cumulative: 0, cumulativeCount: 0, strictCount: 0, overdue: false };
    entry.bills.push(bill);
    entry.amount += expectedAmount(bill);
    if (raw < today) entry.overdue = true;
    byDate.set(dayKey(date), entry);
  }

  const checkpoints = Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  let count = 0;
  let strict = 0;
  for (const checkpoint of checkpoints) {
    running += checkpoint.amount;
    count += checkpoint.bills.length;
    strict += checkpoint.bills.filter(isHardDeadline).length;
    checkpoint.cumulative = running;
    checkpoint.cumulativeCount = count;
    checkpoint.strictCount = strict;
  }

  return checkpoints.slice(0, limit);
}

// ─── Sinking fund ───────────────────────────────────────────────────────────
// A bill that lands every few months is easy to forget until it arrives all at
// once. Treating each one as its own little savings pot answers the question
// "how much should I already have put aside for this?" — the figure is derived
// from how far through the cycle we are, so nothing has to be tracked by hand.

/** Below this many months apart, saving ahead isn't worth the screen space. */
const SINKING_FUND_MIN_MONTHS = 2;

export interface SinkingFund {
  /** What the next payment is expected to cost. */
  target: number;
  /** How much should already be set aside, pro-rated across the cycle. */
  saved: number;
  /** Still to put aside before the due date. */
  remaining: number;
  /** Steady rate that gets you there — the same figure the yearly panel uses. */
  perMonth: number;
  /** 0–1, for the progress bar. */
  progress: number;
}

/**
 * Undefined when the bill recurs too often to be worth saving for, or when
 * there's no due date to work back from.
 */
/**
 * The next due date strictly ahead of today.
 *
 * `nextDueDate` on an unpaid bill points at the payment you currently owe, which
 * may already be behind us — right for the list, wrong for a savings target:
 * you save toward the payment still to come, not the one sitting on your desk.
 */
function forwardDueDate(bill: BillWithStatus, now: Date): Date | undefined {
  const due = bill.nextDueDate;
  if (!due || due >= startOfDay(now)) return due;

  const interval = getIntervalCount(bill);
  switch (bill.frequency) {
    case "weekly":
      return addWeeks(due, interval);
    case "monthly":
      return addMonths(due, interval);
    case "yearly":
      return addYears(due, interval);
  }
}

export function sinkingFund(bill: BillWithStatus, now: Date = new Date()): SinkingFund | undefined {
  if (monthsBetweenPayments(bill) < SINKING_FUND_MIN_MONTHS) return undefined;

  const progress = periodProgress(bill, forwardDueDate(bill, now), now);
  if (progress === undefined) return undefined;

  const target = expectedAmount(bill);
  const saved = target * progress;

  return {
    target,
    saved,
    remaining: Math.max(target - saved, 0),
    perMonth: bill.monthlyEquivalent,
    progress,
  };
}

// ─── Period totals ──────────────────────────────────────────────────────────

export interface PeriodTotals {
  due: number; // still to pay
  paid: number; // already covered
  total: number; // due + paid
  paidPct: number; // 0–100
  unpaidCount: number;
  totalCount: number;
}

export function computePeriodTotals(bills: BillWithStatus[]): PeriodTotals {
  const active = bills.filter((b) => b.isActive);

  const due = active.filter((b) => !b.isPaidThisPeriod).reduce((s, b) => s + expectedAmount(b), 0);
  // Use what was actually paid, which can differ from the estimate.
  const paid = active.filter((b) => b.isPaidThisPeriod).reduce((s, b) => s + (b.payment?.amount ?? b.amount), 0);
  const total = due + paid;

  return {
    due,
    paid,
    total,
    paidPct: total > 0 ? (paid / total) * 100 : 0,
    unpaidCount: active.filter((b) => !b.isPaidThisPeriod).length,
    totalCount: active.length,
  };
}

// ─── Yearly projection ──────────────────────────────────────────────────────

export interface CategoryCost {
  categoryId: string;
  label: string;
  yearlyAmount: number;
  percentage: number;
}

/**
 * Projected annual cost, split by category. Built from each bill's monthly
 * equivalent (which already accounts for interval and variable averages), so
 * quarterly and fortnightly bills are comparable.
 */
export function yearlyBreakdown(bills: BillWithStatus[], labelFor: (categoryId: string) => string): { total: number; categories: CategoryCost[] } {
  const active = bills.filter((b) => b.isActive);
  const total = active.reduce((s, b) => s + b.monthlyEquivalent * 12, 0);

  const byCategory = new Map<string, number>();
  for (const bill of active) {
    byCategory.set(bill.categoryId, (byCategory.get(bill.categoryId) ?? 0) + bill.monthlyEquivalent * 12);
  }

  const categories = Array.from(byCategory.entries())
    .map(([categoryId, yearlyAmount]) => ({
      categoryId,
      label: labelFor(categoryId),
      yearlyAmount,
      percentage: total > 0 ? (yearlyAmount / total) * 100 : 0,
    }))
    .sort((a, b) => b.yearlyAmount - a.yearlyAmount);

  return { total, categories };
}

// ─── Display helper ─────────────────────────────────────────────────────────
// Returns the i18n key + count for a bill's cadence, e.g. "every 2 months".

/** Roughly how many months pass between two payments. */
export function monthsBetweenPayments(bill: Pick<Bill, "frequency" | "intervalCount">): number {
  const interval = getIntervalCount(bill);
  switch (bill.frequency) {
    case "weekly":
      return (interval * 7) / 30.44; // average month length
    case "monthly":
      return interval;
    case "yearly":
      return interval * 12;
  }
}

/**
 * Colour token for a bill's cadence, forming a scale you can read at a glance:
 * the more often a bill recurs, the "hotter" its badge.
 *
 *   weekly-ish  → red      (hits you constantly)
 *   monthly     → blue     (the common case)
 *   2–3 months  → amber
 *   4–11 months → indigo
 *   yearly+     → green    (rare, easy to forget)
 *
 * Uses existing semantic tokens — no new palette.
 */
export function getFrequencyToken(bill: Pick<Bill, "frequency" | "intervalCount">): string {
  const months = monthsBetweenPayments(bill);
  if (months < 1) return "--color-expense";
  if (months < 2) return "--bs-primary";
  if (months < 4) return "--color-goal";
  if (months < 12) return "--color-invest";
  return "--color-income";
}

export function getFrequencyLabel(bill: Pick<Bill, "frequency" | "intervalCount">): { key: string; count: number } {
  const interval = getIntervalCount(bill);
  if (interval === 1) {
    const simple: Record<BillFrequency, string> = { weekly: "bills.weekly", monthly: "bills.monthly", yearly: "bills.yearly" };
    return { key: simple[bill.frequency], count: 1 };
  }
  const every: Record<BillFrequency, string> = { weekly: "bills.everyNWeeks", monthly: "bills.everyNMonths", yearly: "bills.everyNYears" };
  return { key: every[bill.frequency], count: interval };
}
