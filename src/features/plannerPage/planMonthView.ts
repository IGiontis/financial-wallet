import { differenceInCalendarDays, endOfMonth, getDaysInMonth, isSameMonth, startOfMonth } from "date-fns";
import { planMonths, type PlanSlice } from "./payCycles";
import { MAX_HORIZON_MONTHS, THIS_MONTH, horizonEnd, type PlanRow, type PlannerEvent, type PlannerHorizon, type PlannerPlan, type ProjectionPoint } from "./plannerUtils";

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
  /** The plan's rows with what each brings or costs in this month alone — «Τα ποσά σου» for the month. */
  rows: PlanRow[];
  /** How much of a month it is: under 1 for this one, which starts today. */
  monthsCovered: number;
}

/** The row an event is a time of. */
const rowIdOf = (event: PlannerEvent) => event.billId ?? event.incomeId ?? event.goalId ?? event.debtId ?? event.oneOffId;

/**
 * Figures rounded to the cent so that they add up to `target` exactly: each
 * down to the cent, then the cents still missing given to the ones that lost
 * the most in the rounding. Rounding each on its own let two lines of 5,4838
 * print 5,48 + 5,48 under a month that said 10,97.
 */
export function apportion(values: number[], target: number): number[] {
  const cents = values.map((v) => Math.floor(Math.round(v * 1e6) / 1e4));
  let missing = Math.round(target * 100) - cents.reduce((sum, c) => sum + c, 0);
  const byLoss = values.map((v, i) => ({ i, loss: v * 100 - cents[i] })).sort((a, b) => b.loss - a.loss);
  for (let k = 0; missing > 0 && byLoss.length > 0; k = (k + 1) % byLoss.length, missing--) cents[byLoss[k].i] += 1;
  for (let k = byLoss.length - 1; missing < 0 && byLoss.length > 0; k = (k - 1 + byLoss.length) % byLoss.length, missing++) cents[byLoss[k].i] -= 1;
  return cents.map((c) => c / 100);
}

/**
 * Each row of the plan, its total cut to the days `from`–`to`: the events of
 * it inside them, and for a row charged by the day, its stretches' days inside
 * them — at the walk's own daily share. So the rows of a month add up to that
 * month's slice, in and out, as the month list closes it — to the cent when
 * `totals` names the two sides it must land on (see `apportion`).
 */
export function rowsBetween(plan: PlannerPlan, from: number, to: number, totals?: { in: number; out: number }): PlanRow[] {
  const byRow = new Map<string, { total: number; count: number }>();
  const add = (id: string, amount: number, count: number) => {
    const entry = byRow.get(id) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += count;
    byRow.set(id, entry);
  };
  for (const event of plan.events) {
    const offset = differenceInCalendarDays(event.date, plan.start);
    const id = rowIdOf(event);
    if (id !== undefined && offset >= from && offset <= to) add(id, event.amount, 1);
  }
  for (const stretch of plan.stretches) {
    const first = Math.max(stretch.from, from);
    const last = Math.min(stretch.to, to);
    let sum = 0;
    for (let offset = first; offset <= last; offset++) {
      const day = new Date(plan.start.getFullYear(), plan.start.getMonth(), plan.start.getDate() + offset);
      sum += stretch.rate / getDaysInMonth(day);
    }
    if (last >= first) add(stretch.rowId, sum, 0);
  }
  const raw = plan.rows.map((row) => (row.enabled ? (byRow.get(row.id)?.total ?? 0) : 0));
  const cut = raw.map(round2);
  if (totals) {
    const side = (pick: (v: number) => boolean, target: number, sign: 1 | -1) => {
      const at = raw.flatMap((v, i) => (pick(v) ? [i] : []));
      apportion(
        at.map((i) => sign * raw[i]),
        target,
      ).forEach((v, k) => (cut[at[k]] = sign * v));
    };
    side((v) => v > 0, totals.in, 1);
    side((v) => v < 0, totals.out, -1);
  }
  return plan.rows.map(({ spent, ...row }, index) => {
    const entry = byRow.get(row.id);
    return {
      ...row,
      total: cut[index],
      ...(row.occurrences !== undefined ? { occurrences: entry?.count ?? 0 } : {}),
      // What a limit has spent is this month's — a stretch that starts after
      // today has spent nothing yet, and carrying it over read as last month's
      // money still counting against the next.
      ...(spent !== undefined && from === 0 ? { spent } : {}),
    };
  });
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

  const firstDay = differenceInCalendarDays(slice.start, startOfMonth(slice.start)) + 1;
  return {
    slice,
    rows: rowsBetween(plan, slice.from, slice.to, { in: round2(slice.pay + slice.incoming), out: round2(slice.bills + slice.commitments + slice.lines) }),
    monthsCovered: round2((getDaysInMonth(slice.start) - firstDay + 1) / getDaysInMonth(slice.start)),
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
