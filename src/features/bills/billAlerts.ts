import { addMonths, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { amountDueNext, amountOwedNow, billUrgency, earliestDeadline, getDeadline } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

/**
 * How far ahead the popup looks, picked in the settings: days, or calendar
 * months — «1m» on 31 January reaches 28 February, not 3 March.
 */
export const ALERT_REACHES = ["1d", "2d", "3d", "5d", "7d", "14d", "1m", "2m", "3m", "6m"] as const;
export type AlertReach = (typeof ALERT_REACHES)[number];
/** Five days unless the reader picks otherwise — closer than the badge's week. */
export const DEFAULT_REACH: AlertReach = "5d";

/** A stored value, if it is still one of the choices; the default otherwise. */
export const asReach = (value: unknown): AlertReach => (ALERT_REACHES.includes(value as AlertReach) ? (value as AlertReach) : DEFAULT_REACH);

/** A reach as a count and its unit, for its words: `{ count: 2, unit: "m" }`. */
export const reachParts = (reach: AlertReach) => ({ count: parseInt(reach, 10), unit: reach.endsWith("m") ? ("m" as const) : ("d" as const) });

/** A reach per bill, by id; a bill not named takes the general one. */
export type ReachByBill = Record<string, AlertReach>;

/** The reach a bill is looked at with: its own, or the general one. */
export const reachFor = (bill: Pick<BillWithStatus, "id">, general: AlertReach, byBill: ReachByBill = {}): AlertReach => (bill.id in byBill ? asReach(byBill[bill.id]) : general);

/** The whole days from `now` to the end of a reach. */
export function reachDays(reach: AlertReach, now: Date = new Date()): number {
  const { count, unit } = reachParts(reach);
  if (unit === "d") return count;
  const today = startOfDay(now);
  return differenceInCalendarDays(addMonths(today, count), today);
}

/** One payment the popup names: a bill late, or due within its reach. */
export interface BillAlert {
  bill: BillWithStatus;
  /**
   * Which payment this is, and in which state: the bill, the deadline, and
   * whether it has gone. «Don't show again» remembers these keys, so the same
   * payment stays quiet — and the same one going late is a new one.
   */
  key: string;
  /** Past its deadline. */
  late: boolean;
  /** Late, or due today: to pay now. The rest are still to come. */
  now: boolean;
  /** The deadline the money must be there by — for a late bill, its oldest unmet one. */
  deadline: Date;
  /** Whole days to the deadline; negative once it has gone. */
  days: number;
  /** What it asks: everything owed for a late bill, the next payment otherwise. */
  amount: number;
  /** A variable bill: the amount is an estimate. */
  approximate: boolean;
}

/**
 * The bills the popup lists: every one late, and every one unpaid whose
 * deadline is within `aheadDays` — one figure for all, or each bill its own —
 * the ones to pay now first, the oldest first among them. A bill is named once, for its next payment, however far the reach.
 *
 * Read off `billUrgency` and `earliestDeadline`, so it agrees with the colours
 * and the dates on «Πάγια».
 */
export function billAlerts(bills: BillWithStatus[], now: Date = new Date(), aheadDays: number | ((bill: BillWithStatus) => number) = reachDays(DEFAULT_REACH, now)): BillAlert[] {
  return bills
    .flatMap((bill): BillAlert[] => {
      if (!bill.isActive) return [];
      const urgency = billUrgency(bill, now);
      // Settled for this period, its next payment opens the next one — within a
      // long reach, a month's bill paid for October still has November to name.
      const deadline = urgency === "paid" ? bill.nextDueDate && (getDeadline(bill, bill.nextDueDate) ?? bill.nextDueDate) : earliestDeadline(bill, now);
      if (!deadline) return [];
      const days = differenceInCalendarDays(deadline, now);
      const late = urgency === "late";
      if (!late && days > (typeof aheadDays === "number" ? aheadDays : aheadDays(bill))) return [];
      return [
        {
          bill,
          key: `${bill.id}|${format(deadline, "yyyy-MM-dd")}|${late ? "late" : "due"}`,
          late,
          now: late || days <= 0,
          deadline,
          days,
          amount: late ? amountOwedNow(bill, now) : amountDueNext(bill, now),
          approximate: !!bill.isVariableAmount,
        },
      ];
    })
    .sort((a, b) => Number(b.now) - Number(a.now) || a.days - b.days);
}

/** Whether the popup has something to say: a payment the reader has not put away. */
export const hasUnseenAlert = (alerts: BillAlert[], seen: readonly string[]): boolean => alerts.some((alert) => !seen.includes(alert.key));
