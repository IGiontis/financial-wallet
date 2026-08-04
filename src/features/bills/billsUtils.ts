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

export function getNextDueDate(bill: Bill, now: Date = new Date()): Date | undefined {
  const { frequency, dueDay, dueMonth } = bill;
  const interval = getIntervalCount(bill);

  if (frequency === "weekly") {
    if (dueDay == null) return undefined; // dueDay holds the weekday (0–6)
    // Weekday within the current bucket, rolling to the next bucket once passed.
    const periodStart = getPeriodStart(bill, now);
    const candidate = weekdayWithin(periodStart, dueDay);
    if (candidate >= startOfDay(now)) return candidate;
    return weekdayWithin(addWeeks(periodStart, interval), dueDay);
  }

  if (frequency === "monthly") {
    if (dueDay == null) return undefined;
    const periodStart = getPeriodStart(bill, now);
    const candidate = clampDayOfMonth(periodStart.getFullYear(), periodStart.getMonth(), dueDay);
    if (candidate >= startOfDay(now)) return candidate;
    const next = addMonths(periodStart, interval);
    return clampDayOfMonth(next.getFullYear(), next.getMonth(), dueDay);
  }

  // yearly
  if (dueDay == null || dueMonth == null) return undefined;
  const periodStart = getPeriodStart(bill, now);
  const candidate = clampDayOfMonth(periodStart.getFullYear(), dueMonth, dueDay);
  if (candidate >= startOfDay(now)) return candidate;
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

export function monthlyEquivalent(bill: Bill): number {
  const interval = getIntervalCount(bill);
  switch (bill.frequency) {
    case "monthly":
      return bill.amount / interval;
    case "weekly":
      return (bill.amount * 52) / 12 / interval;
    case "yearly":
      return bill.amount / 12 / interval;
  }
}

// ─── Status ─────────────────────────────────────────────────────────────────

export function computeBillStatus(bill: Bill, allPayments: BillPayment[], now: Date = new Date()): BillWithStatus {
  const payments = allPayments
    .filter((p) => p.billId === bill.id)
    .sort((a, b) => firestoreToDate(b.paidDate).getTime() - firestoreToDate(a.paidDate).getTime());

  const currentPeriodKey = getCurrentPeriodKey(bill, now);
  const payment = payments.find((p) => p.periodKey === currentPeriodKey);

  return {
    ...bill,
    currentPeriodKey,
    isPaidThisPeriod: !!payment,
    payment,
    payments,
    lastPaidDate: payments[0] ? firestoreToDate(payments[0].paidDate) : undefined,
    nextDueDate: getNextDueDate(bill, now),
    monthlyEquivalent: monthlyEquivalent(bill),
  };
}

// ─── Display helper ─────────────────────────────────────────────────────────
// Returns the i18n key + count for a bill's cadence, e.g. "every 2 months".

export function getFrequencyLabel(bill: Pick<Bill, "frequency" | "intervalCount">): { key: string; count: number } {
  const interval = getIntervalCount(bill);
  if (interval === 1) {
    const simple: Record<BillFrequency, string> = { weekly: "bills.weekly", monthly: "bills.monthly", yearly: "bills.yearly" };
    return { key: simple[bill.frequency], count: 1 };
  }
  const every: Record<BillFrequency, string> = { weekly: "bills.everyNWeeks", monthly: "bills.everyNMonths", yearly: "bills.everyNYears" };
  return { key: every[bill.frequency], count: interval };
}
