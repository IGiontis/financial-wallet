import { addDays, differenceInCalendarDays } from "date-fns";
import { SALARY_ROW_ID, type PlannerEvent, type PlannerPlan } from "./plannerUtils";

// The plan, cut where a person's money is actually cut: at pay day.
//
// A month is the calendar's unit, not the wallet's. Pay lands on the 30th and
// the rent leaves on the 1st, so "October" holds the end of one pay packet and
// the start of the next, and its closing balance is the best day of it — the
// morning after the pay came in. The question the Planner answers first is
// "is there anything left the evening before the next pay?", and that evening
// only exists in a plan cut at the pay days.
//
// So these are the plan's own days, regrouped: nothing here is projected again.
// Every figure is summed from the plan's events and the budget lines' daily
// accrual — never read back off the running balance — so a test can hold each
// one up against that balance and know the two were worked out apart.
//
// With no salary in the window there is no pay day to cut at, and the same
// stretches fall back to calendar months.

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Rounded to the cent, and never −0, which would print as "−0,00 €". */
const cents = (n: number) => round2(n) + 0;

/** The salary, as the plan marks it — the same test `paydayOutlook` uses. */
const isPay = (event: PlannerEvent) => event.label === SALARY_ROW_ID && event.amount > 0;

export type SliceKind = "pay" | "month";

/** One stretch of the plan: a pay cycle, or a calendar month. */
export interface PlanSlice {
  kind: SliceKind;
  /** First and last day, both inside it. */
  start: Date;
  end: Date;
  /** The same two days as offsets into the plan's window, where 0 is today. */
  from: number;
  to: number;
  /** Days it covers. */
  days: number;
  /** What it starts with: the money there is today for the first, the last one's closing figure after that. */
  carried: number;
  /** The salary in it — for a pay cycle, the one it opens with. */
  pay: number;
  payEvents: PlannerEvent[];
  /** Money out, positive, split the way the Overview's card splits it. */
  bills: number;
  /** Goals and loan instalments: what you have committed to, as against what you are billed. */
  commitments: number;
  /** The budget lines' spending, accrued by the day. */
  lines: number;
  /** Everything else arriving: one-offs, and the income lines — those also in `linesIn`. */
  incoming: number;
  linesIn: number;
  /**
   * The end of its last day: for a pay cycle the eve of the next pay, for a
   * month its last day, and for the last of either the end of the window.
   */
  close: number;
  /** The deepest end-of-day balance inside it, and the first day it is reached. */
  lowest: number;
  lowestOn: Date;
  /** The first day inside it that ends under zero, and the outgoing that took it there when one did. */
  breaksOn?: Date;
  breaksAt?: PlannerEvent;
  /** The evening before the first pay in it — what a month calls "before pay". */
  beforePay?: { on: Date; balance: number };
  /** Every dated item except the salary, in date order. */
  items: PlannerEvent[];
  /** Closes on the window's end rather than on a pay day's eve or a month's end. */
  last: boolean;
  /** Ends lower than the one before it did. Never said of the first or the last. */
  backwards: boolean;
}

type Walk = Pick<PlannerPlan, "start" | "days" | "openingBalance" | "events" | "daily">;

function sliceAt(plan: Walk, starts: number[], kind: SliceKind): PlanSlice[] {
  const { daily, start: today, days } = plan;

  // Bucketed once rather than filtered per slice: three years of a busy plan
  // is a few hundred events against forty slices.
  const byDay = new Map<number, PlannerEvent[]>();
  for (const event of plan.events) {
    const offset = differenceInCalendarDays(event.date, today);
    if (offset < 0 || offset > days) continue;
    const bucket = byDay.get(offset);
    if (bucket) bucket.push(event);
    else byDay.set(offset, [event]);
  }

  const slices: PlanSlice[] = [];
  // Carried forward as summed, unrounded — the walk's own figure is never
  // read back in, so each close is a second route to the same day's balance.
  let carried = plan.openingBalance;
  let previousClose: number | undefined;

  starts.forEach((from, index) => {
    const isLast = index === starts.length - 1;
    const to = isLast ? days : starts[index + 1] - 1;

    let pay = 0;
    let bills = 0;
    let commitments = 0;
    let lines = 0;
    let linesIn = 0;
    let incoming = 0;
    const payEvents: PlannerEvent[] = [];
    const items: PlannerEvent[] = [];
    let lowest = Number.POSITIVE_INFINITY;
    let lowestAt = from;
    let breaksAt: number | undefined;
    let breakingEvent: PlannerEvent | undefined;
    let beforePay: PlanSlice["beforePay"];

    for (let day = from; day <= to; day++) {
      lines += daily.lineOut[day];
      linesIn += daily.lineIn[day];
      const events = byDay.get(day) ?? [];
      for (const event of events) {
        if (isPay(event)) {
          pay += event.amount;
          payEvents.push(event);
          // The day before it, when that day is in the window at all: pay held
          // on today, late, has no evening before it in the plan.
          if (!beforePay && day > 0) beforePay = { on: addDays(today, day - 1), balance: round2(daily.balance[day - 1]) };
          continue;
        }
        items.push(event);
        if (event.amount >= 0) incoming += event.amount;
        else if (event.kind === "bill") bills -= event.amount;
        else commitments -= event.amount;
      }

      // Read to the cent, like the plan's own lowest point: a hair under zero
      // that prints as 0,00 € has not gone anywhere.
      const balance = daily.balance[day];
      if (round2(balance) < round2(lowest)) {
        lowest = balance;
        lowestAt = day;
      }
      if (breaksAt === undefined && round2(balance) < 0) {
        breaksAt = day;
        const outgoings = events.filter((e) => e.amount < 0);
        breakingEvent = outgoings.length > 0 ? outgoings.reduce((big, e) => (e.amount < big.amount ? e : big)) : undefined;
      }
    }

    incoming += linesIn;
    const close = carried + pay + incoming - bills - commitments - lines;
    slices.push({
      kind,
      start: addDays(today, from),
      end: addDays(today, to),
      from,
      to,
      days: to - from + 1,
      carried: round2(carried),
      pay: round2(pay),
      payEvents,
      bills: round2(bills),
      commitments: round2(commitments),
      lines: round2(lines),
      incoming: round2(incoming),
      linesIn: round2(linesIn),
      close: round2(close),
      lowest: round2(lowest),
      lowestOn: addDays(today, lowestAt),
      breaksOn: breaksAt === undefined ? undefined : addDays(today, breaksAt),
      breaksAt: breakingEvent,
      beforePay,
      items,
      last: isLast,
      backwards: index > 0 && !isLast && previousClose !== undefined && round2(close) < round2(previousClose),
    });
    previousClose = close;
    carried = close;
  });

  return slices;
}

/**
 * The window cut at the first of each month.
 *
 * The first runs from today to the end of this month, the last from the 1st
 * of the window's final month to its end — every one a calendar month, so the
 * list of months closes on the same figures a bank statement would.
 */
export function planMonths(plan: Walk): PlanSlice[] {
  const starts = [0];
  for (let day = 1; day <= plan.days; day++) {
    if (addDays(plan.start, day).getDate() === 1) starts.push(day);
  }
  return sliceAt(plan, starts, "month");
}

/**
 * The window cut at every pay day: today to the eve of the first pay, then
 * each pay to the eve of the next, and the last pay to the window's end.
 *
 * Pay day is wherever the plan has put the salary — a late one is held on
 * today, a moved one on its new day, one that came early is gone — so the
 * cycles always agree with the Overview's "until pay day". Without any salary
 * in the window there is nothing to cut at, and the months stand in.
 */
export function payCycles(plan: Walk): PlanSlice[] {
  const paydays = new Set<number>();
  for (const event of plan.events) {
    if (!isPay(event)) continue;
    const offset = differenceInCalendarDays(event.date, plan.start);
    if (offset >= 0 && offset <= plan.days) paydays.add(offset);
  }
  if (paydays.size === 0) return planMonths(plan);
  paydays.add(0);
  return sliceAt(
    plan,
    [...paydays].sort((a, b) => a - b),
    "pay",
  );
}

/** One line of "how it adds up": what a slice started with, then each thing that came or went. */
export interface SliceStep {
  kind: "carried" | "pay" | "item" | "lines" | "linesIn";
  /** Signed, as it moves the balance — except `carried`, which is the balance. */
  amount: number;
  date?: Date;
  /** The plan's own event, for a row that opens its sheet. */
  event?: PlannerEvent;
}

/**
 * A slice as a list that adds up, to the cent, to its closing figure.
 *
 * The dated things are already whole cents. The budget lines are not — they
 * accrue a fraction of a month a day — so once each figure is rounded for the
 * screen, the rounded parts can miss the rounded whole by a cent. Printed as a
 * sum, that cent is the one thing anyone checking it will find. It is put on
 * the budget lines' row, the one figure that was a rounding to begin with, so
 * the list always lands on exactly the figure it explains.
 */
export function sliceSteps(slice: PlanSlice): SliceStep[] {
  const dated: SliceStep[] = [
    ...slice.payEvents.map((event) => ({ kind: "pay" as const, amount: event.amount, date: event.date, event })),
    ...slice.items.map((event) => ({ kind: "item" as const, amount: event.amount, date: event.date, event })),
  ];
  // Stable, and the pay listed first on its own day: it opens the cycle.
  dated.sort((a, b) => a.date!.getTime() - b.date!.getTime());

  const steps: SliceStep[] = [{ kind: "carried", amount: slice.carried, date: slice.start }, ...dated];
  if (slice.linesIn > 0) steps.push({ kind: "linesIn", amount: slice.linesIn });
  if (slice.lines > 0) steps.push({ kind: "lines", amount: -slice.lines });

  // Everything else is whole cents already, so with no budget line in the
  // slice there is no stray cent to place.
  const total = cents(steps.reduce((sum, step) => sum + step.amount, 0));
  const fractional = steps.find((step) => step.kind === "lines") ?? steps.find((step) => step.kind === "linesIn");
  if (fractional && total !== slice.close) fractional.amount = cents(fractional.amount + slice.close - total);
  return steps;
}


/**
 * Where a slice's bar runs on a shared scale: from what is left (or the depth
 * under zero) to everything there was to spend, and the stretch the pay
 * covered.
 */
export function sliceBar(slice: PlanSlice): { low: number; high: number; left: number; payFrom: number; payTo: number } {
  const out = slice.bills + slice.commitments + slice.lines;
  return {
    low: Math.min(slice.close, 0),
    high: round2(slice.close + out),
    left: Math.max(slice.close, 0),
    payFrom: slice.carried,
    payTo: round2(slice.carried + slice.pay),
  };
}

/**
 * One scale for every row, and a handful of round amounts to mark on it.
 *
 * Steps of 1, 2, 2½ and 5 a power of ten, so the ticks read as amounts anyone
 * would say aloud — 0, 1.000, 2.000 or 0, 2.500, 5.000 — about three to a
 * chart. Zero is always on the scale: the bars are measured from it.
 */
export function sliceScale(slices: PlanSlice[]): { min: number; max: number; ticks: number[] } {
  let min = 0;
  let max = 0;
  for (const slice of slices) {
    const bar = sliceBar(slice);
    min = Math.min(min, bar.low, bar.payFrom);
    max = Math.max(max, bar.high, bar.payTo);
  }
  if (max - min < 1) max = min + 1;

  const rough = (max - min) / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + 1e-9; tick += step) ticks.push(round2(tick) + 0);
  return { min, max, ticks };
}
