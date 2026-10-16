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
 */
export function planDays(plan: Pick<PlannerPlan, "start" | "days" | "events" | "daily">): PlanDay[] {
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
  for (let offset = 0; offset <= plan.days; offset++) {
    lines += plan.daily.lineIn[offset] - plan.daily.lineOut[offset];
    const events = byDay.get(offset);
    const last = offset === plan.days;
    if (!events && !(last && round2(lines) !== 0)) continue;
    days.push({
      date: addDays(plan.start, offset),
      events: [...(events ?? [])].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      lines: round2(lines),
      balance: round2(plan.daily.balance[offset]),
    });
    lines = 0;
  }
  return days;
}
