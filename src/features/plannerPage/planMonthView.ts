import { differenceInCalendarDays, endOfMonth, isSameMonth, startOfMonth } from "date-fns";
import { planMonths, type PlanSlice } from "./payCycles";
import { MAX_HORIZON_MONTHS, THIS_MONTH, horizonEnd, type PlannerEvent, type PlannerHorizon, type PlannerPlan, type ProjectionPoint } from "./plannerUtils";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The shortest horizon whose window reaches the end of `month` — what the plan
 * has to be built with for that month to be in it. Undefined past the longest
 * window there is.
 */
export function horizonForMonth(month: Date, now: Date): PlannerHorizon | undefined {
  const last = endOfMonth(month);
  for (let horizon = THIS_MONTH; horizon <= MAX_HORIZON_MONTHS; horizon++) if (horizonEnd(horizon, now) >= last) return horizon;
  return undefined;
}

/** One calendar month of a plan: its figures, and a line of its own, a day at a time. */
export interface PlanMonth {
  /** Its slice — what it starts with, what comes and goes, what it ends with. */
  slice: PlanSlice;
  /** Money in over the month, positive: pay, one-offs and income lines. */
  in: number;
  /** Money out over the month, positive: bills, goals and instalments, the budget lines. */
  out: number;
  /** The plan cut to the month, drawn by the day whatever the window's own step. */
  view: PlannerPlan;
}

/**
 * The month `month` falls in, out of a plan long enough to hold it.
 *
 * The figures are `planMonths`' — the slices the month list closes on — so
 * what it starts with, plus what comes, less what goes, is what it ends with,
 * as that list says. The line is read off the plan's daily walk rather than
 * its points: a window of years is drawn a month a point, and a month drawn
 * from one point is no line at all.
 */
export function planMonth(plan: PlannerPlan, month: Date): PlanMonth | undefined {
  const slice = planMonths(plan).find((s) => isSameMonth(s.start, month));
  if (!slice) return undefined;

  const byDay = new Map<number, PlannerEvent[]>();
  for (const event of plan.events) {
    const offset = differenceInCalendarDays(event.date, plan.start);
    if (offset < slice.from || offset > slice.to) continue;
    const bucket = byDay.get(offset);
    if (bucket) bucket.push(event);
    else byDay.set(offset, [event]);
  }
  const points: ProjectionPoint[] = [];
  for (let offset = slice.from; offset <= slice.to; offset++) {
    const date = new Date(plan.start.getFullYear(), plan.start.getMonth(), plan.start.getDate() + offset);
    points.push({ date, balance: round2(plan.daily.balance[offset]), events: byDay.get(offset) ?? [], accruedIn: plan.daily.lineIn[offset], accruedOut: plan.daily.lineOut[offset] } as ProjectionPoint);
  }

  return {
    slice,
    in: round2(slice.pay + slice.incoming),
    out: round2(slice.bills + slice.commitments + slice.lines),
    view: {
      ...plan,
      start: slice.start,
      end: slice.end,
      points,
      pointStep: "day",
      breaksOn: slice.breaksOn,
      lowestBalance: slice.lowest,
      lowestOn: slice.lowestOn,
    },
  };
}

/** The first month the window holds, and the last a plan can reach. */
export function monthRange(now: Date): { first: Date; last: Date } {
  return { first: startOfMonth(now), last: startOfMonth(horizonEnd(MAX_HORIZON_MONTHS, now)) };
}
