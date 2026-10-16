import { addDays, differenceInCalendarDays } from "date-fns";
import type { PlannerEvent, PlannerPlan } from "./plannerUtils";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One day the plan has something on, as the chart's sheet lists it. */
export interface PlanDay {
  date: Date;
  /** What lands that day, biggest first. */
  events: PlannerEvent[];
  /**
   * The budget lines' money since the day listed before this one, this day
   * included, signed. They run a little every day and land on no date, so a
   * list of dated things alone would not add up to the balance beside it.
   */
  lines: number;
  /** What is left at the end of the day — the chart's own figure for it. */
  balance: number;
  /** The plan's lowest day, listed even when nothing lands on it. */
  lowest?: boolean;
}

/**
 * The plan as a list of days: every day something lands, with the balance at
 * its end.
 *
 * Read straight off the walk the chart is drawn from, a day at a time whatever
 * the chart is sampled at, so a day here and the same day under a finger on
 * the line never disagree. The budget lines in between are carried on the
 * next day listed; whatever they add after the last dated thing is a final
 * day of its own, on the plan's last day, so the list always ends on the
 * figure the plan ends on.
 *
 * The lowest day is listed too, even when nothing lands on it: the lines
 * alone can drain the balance to its low between two bills, and the tile
 * above names that day — a list without it had nothing to point to. (Unless
 * the low is simply where it starts, which the list opens with anyway.)
 */
export function planDays(plan: Pick<PlannerPlan, "start" | "days" | "events" | "daily" | "lowestOn" | "openingBalance">): PlanDay[] {
  const lowestOffset = differenceInCalendarDays(plan.lowestOn, plan.start);
  const byDay = new Map<number, PlannerEvent[]>();
  for (const event of plan.events) {
    const offset = differenceInCalendarDays(event.date, plan.start);
    if (offset < 0 || offset > plan.days) continue;
    const bucket = byDay.get(offset);
    if (bucket) bucket.push(event);
    else byDay.set(offset, [event]);
  }

  const days: PlanDay[] = [];
  let lines = 0;
  // The balance last printed, rounded as it was printed.
  let printed = round2(plan.openingBalance);
  for (let offset = 0; offset <= plan.days; offset++) {
    lines += plan.daily.lineIn[offset] - plan.daily.lineOut[offset];
    const events = byDay.get(offset);
    const last = offset === plan.days;
    // Not when it is only where the plan starts: the first line already says that.
    const lowest = offset === lowestOffset && round2(plan.daily.balance[offset]) < round2(plan.openingBalance);
    if (!events && !lowest && !(last && round2(lines) !== 0)) continue;
    const balance = round2(plan.daily.balance[offset]);
    const dated = round2((events ?? []).reduce((sum, e) => sum + e.amount, 0));
    days.push({
      date: addDays(plan.start, offset),
      events: [...(events ?? [])].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      // What takes the last printed figure to this one, rather than the lines
      // rounded on their own: those drift a cent from the balances either
      // side, and a reader subtracting one row from the next lands a cent out.
      lines: round2(balance - printed - dated),
      balance,
      ...(lowest ? { lowest: true } : {}),
    });
    lines = 0;
    printed = balance;
  }
  return days;
}
