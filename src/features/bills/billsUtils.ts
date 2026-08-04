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

export function getNextDueDate(bill: Bill, now: Date = new Date(), skipCurrentPeriod = false): Date | undefined {
  const { frequency, dueDay, dueMonth } = bill;
  const interval = getIntervalCount(bill);

  if (frequency === "weekly") {
    if (dueDay == null) return undefined; // dueDay holds the weekday (0–6)
    // Weekday within the current bucket, rolling to the next bucket once passed.
    const periodStart = getPeriodStart(bill, now);
    const candidate = weekdayWithin(periodStart, dueDay);
    if (!skipCurrentPeriod && candidate >= startOfDay(now)) return candidate;
    return weekdayWithin(addWeeks(periodStart, interval), dueDay);
  }

  if (frequency === "monthly") {
    if (dueDay == null) return undefined;
    const periodStart = getPeriodStart(bill, now);
    const candidate = clampDayOfMonth(periodStart.getFullYear(), periodStart.getMonth(), dueDay);
    if (!skipCurrentPeriod && candidate >= startOfDay(now)) return candidate;
    const next = addMonths(periodStart, interval);
    return clampDayOfMonth(next.getFullYear(), next.getMonth(), dueDay);
  }

  // yearly
  if (dueDay == null || dueMonth == null) return undefined;
  const periodStart = getPeriodStart(bill, now);
  const candidate = clampDayOfMonth(periodStart.getFullYear(), dueMonth, dueDay);
  if (!skipCurrentPeriod && candidate >= startOfDay(now)) return candidate;
  return clampDayOfMonth(periodStart.getFullYear() + interval, dueMonth, dueDay);
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
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

// ─── Status ─────────────────────────────────────────────────────────────────

export function computeBillStatus(bill: Bill, allPayments: BillPayment[], now: Date = new Date()): BillWithStatus {
  const payments = allPayments
    .filter((p) => p.billId === bill.id)
    .sort((a, b) => firestoreToDate(b.paidDate).getTime() - firestoreToDate(a.paidDate).getTime());

  const currentPeriodKey = getCurrentPeriodKey(bill, now);
  const payment = payments.find((p) => p.periodKey === currentPeriodKey);

  // For variable bills, forecast from what has actually been paid rather than
  // the (necessarily rough) stored estimate.
  const average = averagePaidAmount(payments);
  const forecastAmount = bill.isVariableAmount ? (average ?? bill.amount) : bill.amount;

  return {
    ...bill,
    currentPeriodKey,
    isPaidThisPeriod: !!payment,
    payment,
    payments,
    averagePaidAmount: average,
    lastPaidDate: payments[0] ? firestoreToDate(payments[0].paidDate) : undefined,
    nextDueDate: getNextDueDate(bill, now, !!payment),
    monthlyEquivalent: monthlyEquivalent(bill, forecastAmount),
  };
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
  const days = daysUntilDue(bill, now);
  // No due date set → it can't be late, so treat it as upcoming.
  return days !== undefined && days < 0 ? "overdue" : "upcoming";
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

  // Most overdue first; soonest due first; most recently paid first.
  const byDays = (a: BillWithStatus, b: BillWithStatus) => (daysUntilDue(a, now) ?? Number.MAX_SAFE_INTEGER) - (daysUntilDue(b, now) ?? Number.MAX_SAFE_INTEGER);
  groups.overdue.sort(byDays);
  groups.upcoming.sort(byDays);
  groups.paid.sort((a, b) => (b.lastPaidDate?.getTime() ?? 0) - (a.lastPaidDate?.getTime() ?? 0));

  return groups;
}

/** Amount a bill is expected to cost — the recent average for variable bills. */
export const expectedAmount = (bill: BillWithStatus) => (bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);

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
