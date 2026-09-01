import { addMonths, addWeeks, addYears, differenceInCalendarMonths, differenceInCalendarWeeks, getISOWeek, getISOWeekYear, startOfWeek } from "date-fns";
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

/** The bucket start `steps` whole periods after `start` (negative steps go back). */
export function shiftPeriodStart(bill: Pick<Bill, "frequency" | "intervalCount">, start: Date, steps: number): Date {
  const distance = getIntervalCount(bill) * steps;
  switch (bill.frequency) {
    case "weekly":
      return addWeeks(start, distance);
    case "monthly":
      return addMonths(start, distance);
    case "yearly":
      return addYears(start, distance);
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

// ─── Paying ahead ───────────────────────────────────────────────────────────
// Sometimes the money is there now and the bill isn't due for weeks — rent
// settled while you still have the cash, a subscription cleared before a trip.
// A payment therefore isn't tied to "whatever period today falls in": it names
// the period it covers, and the user picks that period when they confirm.

/** How far ahead a bill can be settled — enough for a year of monthly ones. */
export const MAX_PERIODS_AHEAD = 12;

export interface PeriodOption {
  /** The key a payment for this period is stored under. */
  key: string;
  /** First day of the period bucket. */
  start: Date;
  /** Last day the bucket covers — differs from `start` when interval > 1. */
  end: Date;
  dueDate?: Date;
  isPaid: boolean;
  /** 0 = the period we're in now, 1 = the one after it, … */
  offset: number;
}

/**
 * The periods around now, each flagged with whether it has already been settled
 * — the menu behind "which one am I paying?".
 *
 * `back` opens up the periods *before* this one. Without it the list started at
 * the current period, so a payment made last year could only be filed against
 * this one: a yearly bill settled in October 2025 was recorded as covering
 * 2026, and duly announced its next payment for 2027. Back-filling a payment
 * you actually made is ordinary bookkeeping, and the menu has to allow it.
 */
export function getPeriodOptions(bill: Bill, payments: BillPayment[], now: Date = new Date(), count = 4, back = 0): PeriodOption[] {
  const currentStart = getPeriodStart(bill, now);
  const paidKeys = new Set(payments.filter((p) => p.billId === bill.id).map((p) => p.periodKey));
  const earliest = -Math.max(0, back);

  return Array.from({ length: Math.max(1, count) + Math.max(0, back) }, (_, i) => {
    const offset = earliest + i;
    const start = shiftPeriodStart(bill, currentStart, offset);
    const nextStart = shiftPeriodStart(bill, start, 1);
    const end = new Date(nextStart.getTime() - 86_400_000);
    const key = getPeriodKey(bill, start);
    return { key, start, end, dueDate: getPeriodDueDate(bill, start), isPaid: paidKeys.has(key), offset };
  });
}

/**
 * Length of the unbroken run of settled periods starting at the current one.
 * 0 when this period is unpaid, 1 for the ordinary "paid up to date", 2+ once
 * the user has paid ahead. A gap stops the count: a covered March means
 * nothing while February is still outstanding.
 */
export function coveredPeriodCount(bill: Bill, payments: BillPayment[], now: Date = new Date()): number {
  const paidKeys = new Set(payments.filter((p) => p.billId === bill.id).map((p) => p.periodKey));
  const currentStart = getPeriodStart(bill, now);

  let covered = 0;
  while (covered <= MAX_PERIODS_AHEAD && paidKeys.has(getPeriodKey(bill, shiftPeriodStart(bill, currentStart, covered)))) covered++;
  return covered;
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

  // Paying ahead: count the unbroken run of covered periods starting here, so
  // "next due" points past everything already settled rather than at a month
  // the user has a receipt for.
  const covered = coveredPeriodCount(bill, payments, now);
  const nextDueDate = covered > 1 ? getPeriodDueDate(bill, shiftPeriodStart(bill, getPeriodStart(bill, now), covered)) : getNextDueDate(bill, now, !!payment);

  return {
    ...bill,
    currentPeriodKey,
    isPaidThisPeriod: !!payment,
    paidAheadCount: Math.max(0, covered - 1),
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
  /** The payment being saved for. */
  dueDate: Date;
  /** Whole months from today until then. Zero once it lands this month. */
  monthsLeft: number;
  /**
   * What to set aside each month from now to have the whole of it by the due
   * date.
   *
   * Deliberately not the steady across-the-cycle rate: the app has no idea what
   * anyone has actually put by, so the only honest question it can answer is
   * "starting today, how much a month?". The steady rate is still shown, as the
   * bill's monthly equivalent, where it is a description of the bill rather than
   * a claim about savings.
   */
  perMonth: number;
  /** How far through the gap between payments we are, 0–1. Time, not money. */
  elapsed: number;
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

  const dueDate = forwardDueDate(bill, now);
  const elapsed = periodProgress(bill, dueDate, now);
  if (!dueDate || elapsed === undefined) return undefined;

  const target = expectedAmount(bill);
  // Whole months only: a bill due in eleven days wants the whole amount this
  // month, not eleven thirtieths of it.
  const monthsLeft = Math.max(differenceInCalendarMonths(dueDate, now), 0);

  return {
    target,
    dueDate,
    monthsLeft,
    perMonth: monthsLeft > 0 ? target / monthsLeft : target,
    elapsed,
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


// ─── Next month's bill ──────────────────────────────────────────────────────
// "What is next month going to cost me?" — asked before the month arrives, so
// there is time to do something about the answer. Split fixed from variable
// because the two carry different confidence: rent is €500 and will be €500,
// while electricity is a guess built from what it has been.
//
// Real occurrences, not a monthly average: a quarterly bill landing in
// September belongs in September's figure in full, and doesn't quietly smear
// a third of itself across the two months either side.

/** Guards the period walk — far more than any real bill needs in one month. */
const MAX_PERIODS_PER_MONTH = 64;

/** One payment landing in the month — the line behind the total. */
export interface MonthForecastItem {
  bill: BillWithStatus;
  periodKey: string;
  /** When it lands: its due date, or the period's own start if none is set. */
  date: Date;
  amount: number;
  isPaid: boolean;
  isVariable: boolean;
  /**
   * When the money actually left, for something already settled.
   *
   * Separate from `date` because the two genuinely differ: September's rent
   * paid on 29 August is September's obligation, discharged in August. A month
   * is a list of what it owes, so it is filed under September — but saying it
   * was paid *on* 1 September would be a fabrication.
   */
  paidDate?: Date;
}

export interface MonthForecast {
  monthStart: Date;
  /** Bills whose amount is known in advance. */
  fixed: number;
  /** Estimated from recent payments — the soft half of the total. */
  variable: number;
  /** fixed + variable: what is still to be paid. */
  total: number;
  /** Falls in the month but is already settled, so it sits outside `total`. */
  prepaid: number;
  fixedCount: number;
  variableCount: number;
  prepaidCount: number;
  /** Every occurrence making up the figures above, earliest first. */
  items: MonthForecastItem[];
}

/**
 * Every payment landing in the calendar month `monthOffset` months from now,
 * with anything already settled kept separately — pay September's rent in
 * August and September's figure drops accordingly, which is the entire reason
 * for paying early.
 */
export function monthForecast(bills: BillWithStatus[], now: Date = new Date(), monthOffset = 1): MonthForecast {
  const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);

  const items: MonthForecastItem[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;
    // Keyed by amount, not just presence: a settled occurrence should show what
    // actually left the account, which for a variable bill is the whole point.
    const paidByKey = new Map(bill.payments.map((p) => [p.periodKey, p]));

    // Anchored on the month being asked about rather than on today: a bucket
    // that opened last month can still fall due inside this one.
    let start = getPeriodStart(bill, monthStart);
    for (let i = 0; i < MAX_PERIODS_PER_MONTH && start <= monthEnd; i++) {
      // A bill with no due day still lands somewhere — treat the period's own
      // start as the date it arrives, rather than dropping it from the total.
      const date = getPeriodDueDate(bill, start) ?? start;
      const periodKey = getPeriodKey(bill, start);

      if (date >= monthStart && date <= monthEnd) {
        const paid = paidByKey.get(periodKey);
        items.push({
          bill,
          periodKey,
          date,
          // A settled occurrence is worth what was actually paid; an unpaid one
          // can only be the expectation.
          amount: paid ? paid.amount : expectedAmount(bill),
          isPaid: paid !== undefined,
          isVariable: !!bill.isVariableAmount,
          paidDate: paid ? firestoreToDate(paid.paidDate) : undefined,
        });
      }

      start = shiftPeriodStart(bill, start, 1);
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.bill.name.localeCompare(b.bill.name));

  const forecast: MonthForecast = { monthStart, fixed: 0, variable: 0, total: 0, prepaid: 0, fixedCount: 0, variableCount: 0, prepaidCount: 0, items };

  for (const item of items) {
    if (item.isPaid) {
      forecast.prepaid += item.amount;
      forecast.prepaidCount++;
    } else if (item.isVariable) {
      forecast.variable += item.amount;
      forecast.variableCount++;
    } else {
      forecast.fixed += item.amount;
      forecast.fixedCount++;
    }
  }

  forecast.total = forecast.fixed + forecast.variable;
  return forecast;
}

// ─── Arrears ────────────────────────────────────────────────────────────────
// Everything whose deadline has been and gone with no payment against it. The
// bill list only ever shows the period you are in, so a month you skipped
// entirely quietly falls off the screen once the next one starts — the debt is
// still real, and this is what surfaces it.

/** How far back to look for unpaid periods. A year of monthly bills. */
const MAX_ARREARS_LOOKBACK = 12;

/**
 * Unpaid periods whose deadline has already passed, oldest first.
 *
 * Bounded by the bill's own start as well as the lookback: a bill created last
 * month cannot be six months in arrears, and walking past its anchor would
 * invent periods that never existed.
 */
export function arrears(bills: BillWithStatus[], now: Date = new Date(), maxPeriodsBack = MAX_ARREARS_LOOKBACK): MonthForecastItem[] {
  const today = startOfDay(now);
  const items: MonthForecastItem[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;
    const paidKeys = new Set(bill.payments.map((p) => p.periodKey));
    const born = getPeriodStart(bill, firestoreToDate(bill.anchorDate ?? bill.createdAt));

    let start = getPeriodStart(bill, now);
    for (let i = 0; i <= maxPeriodsBack && start >= born; i++) {
      const periodKey = getPeriodKey(bill, start);
      const due = getPeriodDueDate(bill, start) ?? start;
      // Measured against the deadline, not the due date: a bill inside its
      // grace window is late in no meaningful sense — it is still payable.
      const deadline = getDeadline(bill, due) ?? due;

      if (deadline < today && !paidKeys.has(periodKey)) {
        items.push({ bill, periodKey, date: due, amount: expectedAmount(bill), isPaid: false, isVariable: !!bill.isVariableAmount });
      }

      start = shiftPeriodStart(bill, start, -1);
    }
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.bill.name.localeCompare(b.bill.name));
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

// ─── Month strip ────────────────────────────────────────────────────────────
// A second way to read the list: instead of one figure per bill, a run of
// calendar months, coloured in where a payment covers them. A bill every 2
// months paints two months solid per payment — the shape of the cadence
// becomes something you can see rather than something the subtitle states.
//
// Calendar months rather than the bill's own period buckets on purpose: "Ιαν
// Φεβ Μαρ" reads at a glance, "Ιαν–Φεβ · Μαρ–Απρ" does not. Weekly bills are
// the one frequency this doesn't fit — several of their periods land inside a
// single calendar month, so one chip can't stand for one period the way it can
// for everything monthly or slower.

export type MonthChipStatus = "paid" | "due" | "empty";

export interface MonthChip {
  key: string;
  start: Date;
  status: MonthChipStatus;
}

/** False for weekly bills — the one frequency a monthly strip can't represent. */
export const supportsMonthStrip = (bill: Pick<Bill, "frequency">) => bill.frequency !== "weekly";

/**
 * A short run of months around now, coloured the same way the year calendar
 * colours them.
 *
 * `before` and `after` count whole calendar months either side of the current
 * one, which is always included — so the defaults draw 6 chips.
 *
 * Green means covered, not "a payment is filed under this month's key". A
 * yearly subscription paid last October covers every month up to the next
 * October, and the strip that showed those months blank was answering a
 * question nobody asked.
 */
export function billMonthStrip(bill: BillWithStatus, now: Date = new Date(), before = 3, after = 2): MonthChip[] {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextDuePeriodKey = bill.nextDueDate ? getPeriodKey(bill, bill.nextDueDate) : undefined;

  const months = Array.from({ length: before + after + 1 }, (_, i) => {
    const start = addMonths(currentMonthStart, i - before);
    return { year: start.getFullYear(), month: start.getMonth() };
  });

  return coverageForMonths(bill, months, now).map((cell) => ({
    key: `${cell.year}-${cell.month}`,
    start: new Date(cell.year, cell.month, 1),
    // Three colours to the calendar's five. "Due" stays keyed to the period
    // `nextDueDate` names rather than to the current month, so the payment
    // coming up reads as coming up however far off it is — and every month it
    // covers reads that way with it.
    status: cell.status === "paid" ? "paid" : cell.status === "overdue" || cell.periodKey === nextDuePeriodKey ? "due" : "empty",
  }));
}

// ─── This month ──────────────────────────────────────────────────────────────

/**
 * The summary-card figures, read off the same breakdown the card opens onto.
 *
 * Derived rather than computed separately on purpose: the card and its
 * breakdown are one tap apart, and two independent sums are two chances to
 * disagree.
 */
export function periodTotals(breakdown: MonthForecast): PeriodTotals {
  const due = breakdown.total;
  const paid = breakdown.prepaid;
  const total = due + paid;

  return {
    due,
    paid,
    total,
    paidPct: total > 0 ? (paid / total) * 100 : 0,
    unpaidCount: breakdown.fixedCount + breakdown.variableCount,
    totalCount: breakdown.items.length,
  };
}

// ─── Coverage, month by month ────────────────────────────────────────────────
// Which months a bill is actually covered for — the question a calendar of
// squares is really being asked.
//
// Not "which month does a payment fall due in": that lights up one square a
// year for an annual subscription and leaves the eleven months it paid for
// looking unpaid. A payment buys the stretch from its own due date to the next
// one, so October 2025 on a yearly bill covers through September 2026, and
// October 2026 opens the next stretch.

export type MonthCellStatus = "none" | "paid" | "overdue" | "due" | "future";

export interface MonthCell {
  year: number;
  /** 0–11. */
  month: number;
  /** The period covering this month. */
  periodKey?: string;
  /** When that period falls due. */
  dueDate?: Date;
  /** The due date lands in this month, so the stretch begins here. */
  isPeriodStart: boolean;
  status: MonthCellStatus;
  payment?: BillPayment;
  /** What was paid, or what is expected. */
  amount?: number;
}

/**
 * Years to lay out: the bill's own, plus at least a couple behind.
 *
 * Never just "since the bill was created": a subscription added this year may
 * well have been paid last October, and recording that is the whole reason the
 * calendar reaches backwards. Bounded at the far end so an old bill does not
 * unroll a decade of squares.
 */
export function billCoverageYears(bill: BillWithStatus, now: Date = new Date(), maxBack = 3, minBack = 2): number[] {
  const born = firestoreToDate(bill.anchorDate ?? bill.createdAt).getFullYear();
  const first = Math.max(Math.min(born, now.getFullYear() - minBack), now.getFullYear() - maxBack);
  const last = now.getFullYear() + 1;

  return Array.from({ length: Math.max(last - first + 1, 1) }, (_, i) => first + i);
}

/**
 * Every month of `years`, each tagged with the period covering it.
 *
 * A month belongs to the most recent period whose due date has arrived by the
 * end of it. That puts a boundary month — October 2026, when the previous year
 * runs to the 4th — with the period starting in it rather than the one ending,
 * which is what "October is the payment month" means.
 *
 * Weekly bills get nothing: several periods land in one month, and a square
 * standing for a month cannot represent them.
 */
export function billCoverage(bill: BillWithStatus, years: number[], now: Date = new Date()): MonthCell[] {
  return coverageForMonths(bill, years.flatMap((year) => Array.from({ length: 12 }, (_, month) => ({ year, month }))), now);
}

/**
 * The coverage walk itself, over whatever months are asked for.
 *
 * Shared by the year calendar in the bill's own dialog and the short strip on
 * its card, because the two sit one tap apart and answering the same question
 * differently is how a screen loses your trust.
 */
export function coverageForMonths(bill: BillWithStatus, months: { year: number; month: number }[], now: Date = new Date()): MonthCell[] {
  const cells: MonthCell[] = months.map(({ year, month }) => ({ year, month, isPeriodStart: false, status: "none" as MonthCellStatus }));
  if (!supportsMonthStrip(bill) || cells.length === 0) return cells;

  const first = cells.reduce((earliest, c) => (c.year * 12 + c.month < earliest.year * 12 + earliest.month ? c : earliest));
  const last = cells.reduce((latest, c) => (c.year * 12 + c.month > latest.year * 12 + latest.month ? c : latest));

  const windowStart = new Date(first.year, first.month, 1);
  const windowEnd = new Date(last.year, last.month + 1, 0, 23, 59, 59, 999);
  const today = startOfDay(now);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const paidByKey = new Map(bill.payments.map((p) => [p.periodKey, p]));

  // One period back, so a month at the very start of the window is still
  // covered by whatever was paid before it.
  const periods: { key: string; due: Date }[] = [];
  // Nothing before the bill existed: a subscription started in August was not
  // quietly unpaid all spring, and colouring those months would invent a debt.
  //
  // Unless it was paid. Recording a payment you actually made before you got
  // round to adding the bill is the whole reason the calendar reaches back, and
  // a period with money against it is a fact whatever its date.
  const born = getPeriodStart(bill, firestoreToDate(bill.anchorDate ?? bill.createdAt));
  let start = shiftPeriodStart(bill, getPeriodStart(bill, windowStart), -1);

  for (let i = 0; i < 400; i++) {
    const due = getPeriodDueDate(bill, start) ?? start;
    if (due > windowEnd) break;

    const key = getPeriodKey(bill, start);
    if (start >= born || paidByKey.has(key)) periods.push({ key, due });
    start = shiftPeriodStart(bill, start, 1);
  }

  for (const cell of cells) {
    const monthEnd = new Date(cell.year, cell.month + 1, 0, 23, 59, 59, 999);
    const covering = periods.filter((p) => p.due <= monthEnd).pop();
    if (!covering) continue;

    const payment = paidByKey.get(covering.key);
    // Measured against the deadline, not the due date: a bill inside its grace
    // window is late in no meaningful sense.
    const deadline = getDeadline(bill, covering.due) ?? covering.due;

    cell.periodKey = covering.key;
    cell.dueDate = covering.due;
    cell.isPeriodStart = covering.due.getFullYear() === cell.year && covering.due.getMonth() === cell.month;
    cell.payment = payment;
    cell.amount = payment ? payment.amount : expectedAmount(bill);
    cell.status = payment ? "paid" : deadline < today ? "overdue" : covering.due <= endOfThisMonth ? "due" : "future";
  }

  return cells;
}
