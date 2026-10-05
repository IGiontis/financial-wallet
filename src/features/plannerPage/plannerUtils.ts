import { addDays, addMonths, addYears, differenceInCalendarDays, endOfMonth, getDaysInMonth, startOfDay, startOfMonth } from "date-fns";
import { createResolver, lookbackStart, occurrenceKey, type Actuals, type PlannedOccurrence, type ResolvedOccurrence } from "./plannerActuals";
import { planIncomes } from "./plannerIncomes";
import { firestoreToDate } from "../../shared/utils/dates";
import type { Income } from "../incomes/incomesUtils";
import { currentRate, isLoan, loanPayoff, monthlyInstalment } from "../debts/debtsUtils";
import { deadlinePace } from "../budget/investmentsUtils";
import { currentPause, getDeadline, getGraceDays, getInstallmentCount, getPeriodDueDate, getPeriodKey, getPeriodStart, installmentAmount, installmentDueDates, isPausedOn, paidInstallments, shiftPeriodStart } from "../bills/billsUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// The planner is a forward budget: what is going to arrive, what is going to
// leave, over the next one to twelve months.
//
// It deliberately does not look at what has already been spent. An average of
// the last thirty days answers "what have I been doing", not "what am I going
// to do" — it cannot tell a decision from a quiet week, so a change made today
// took a month to reach the forecast, and one unusual purchase distorted every
// month ahead of it. What the user believes about next month is better
// information than what the ledger remembers about last month, so the budget
// lines are theirs to write and every row is theirs to switch off.
//
// Bills and goals are still read from the app's own data, because those are
// already commitments rather than guesses. So is the money in: the salary and
// every other regular income come from «Έσοδα», where the user typed them —
// see `planIncomes`. The Planner keeps no copy of its own.

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Rounded and negated, without turning a zero row into `-0` and "−0,00 €". */
const negate = (n: number) => (n === 0 ? 0 : -round2(n));
const clampDay = (year: number, month: number, day: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));

// ─── Goals ───────────────────────────────────────────────────────────────────

/**
 * What a goal wants from *this* month's money.
 *
 * For a recurring goal this is deliberately not `remaining`: that figure
 * accumulates arrears from every month since the goal was created, so a €200
 * monthly goal left alone for five months reports €1,000 owed. Demanding all of
 * it from one paycheque would be both wrong and demoralising — the plan asks
 * for this period's target less whatever has already gone in, and back-payments
 * stay a separate conversation on the Goals screen.
 */
export function goalMonthlyNeed(goal: InvestmentGoalWithStats, now: Date = new Date()): number {
  if (goal.goalType === "open_ended") return 0;

  if (goal.targetPeriod === "monthly") {
    const target = goal.monthlyRequired ?? goal.targetAmount ?? 0;
    return round2(Math.max(target - (goal.currentPeriodSaved ?? 0), 0));
  }

  // A yearly target spread evenly; the year-to-date position belongs to the
  // Goals screen, not to one month's cash plan.
  if (goal.targetPeriod === "yearly") return round2((goal.yearlyRequired ?? goal.targetAmount ?? 0) / 12);

  // A deadline: this month's slice, less whatever already went in this month.
  // The slicing is `deadlinePace`, shared with the Goals page and the
  // Allocation page so the three can no longer disagree about the same goal.
  if (goal.deadline) return deadlineSlices(goal, now).thisMonth;

  return round2(goal.monthlyRequired ?? 0);
}

/** A goal with a deadline, sliced by the one rule every screen uses — see `deadlinePace`. */
const deadlineSlices = (goal: InvestmentGoalWithStats, now: Date) => deadlinePace(goal.remaining ?? 0, firestoreToDate(goal.deadline), goal.currentPeriodSaved ?? 0, now);

/** The full monthly target, ignoring what has already gone in this period. */
export function goalMonthlyTarget(goal: InvestmentGoalWithStats, now: Date = new Date()): number {
  if (goal.goalType === "open_ended") return 0;
  if (goal.targetPeriod === "monthly") return round2(goal.monthlyRequired ?? goal.targetAmount ?? 0);
  if (goal.targetPeriod !== "yearly" && goal.deadline) return deadlineSlices(goal, now).perMonth;
  return goalMonthlyNeed(goal, now);
}

export const plannableGoals = (goals: InvestmentGoalWithStats[]) => goals.filter((g) => g.isActive && !g.isCompleted);

/**
 * Of the months ahead, the ones this goal is still asking for money in.
 *
 * A deadline ends a goal. Without this the plan charged every goal in every
 * month of the window regardless — a target due on 4 October went on taking
 * its slice through the following August on a twelve-month view, which is both
 * wrong and the most alarming kind of wrong, since it makes a perfectly
 * affordable year look unaffordable.
 *
 * Compared by month rather than by day: a deadline on the 4th still wants that
 * whole month's contribution, and a goal is funded in monthly slices, not on
 * the deadline itself.
 */
export function goalMonthsAhead(goal: InvestmentGoalWithStats, months: Date[]): Date[] {
  if (!goal.deadline) return months;
  const last = startOfMonth(firestoreToDate(goal.deadline));
  return months.filter((month) => month <= last);
}

// ─── Horizon ─────────────────────────────────────────────────────────────────

/**
 * How far ahead to look, in months.
 *
 * A plain count rather than a fixed set of names. It began as "1m" | "3m" |
 * "6m" | "12m", which meant the question "what do the next three years look
 * like?" had no way of being asked — and the answer was never a different kind
 * of calculation, only a different number.
 */
export type PlannerHorizon = number;

/** The offered ones. Anything else is typed in and equally valid. */
export const PLANNER_HORIZONS: readonly number[] = [1, 3, 6, 12, 24, 36] as const;

export const MIN_HORIZON_MONTHS = 1;
/** Ten years. Past this the daily walk below is tens of thousands of points for a line nobody can read. */
export const MAX_HORIZON_MONTHS = 120;

/**
 * Anything unusable, read back as the shortest.
 *
 * The horizon is persisted, so a browser can hand back a value from an older
 * version long after it stopped meaning anything — including the old "1m"
 * names, which are still understood here, and "payday", which never was. Left
 * unchecked those reach `addMonths` as NaN and the whole page dies on an
 * invalid date, so the value is narrowed on the way in rather than trusted
 * because its type says so.
 */
export function asHorizon(value: unknown): PlannerHorizon {
  const raw = typeof value === "string" ? Number(/^(\d+)m?$/.exec(value.trim())?.[1] ?? NaN) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return MIN_HORIZON_MONTHS;
  return Math.min(Math.max(Math.round(raw), MIN_HORIZON_MONTHS), MAX_HORIZON_MONTHS);
}

export const horizonMonths = (horizon: PlannerHorizon): number => asHorizon(horizon);

/**
 * Last day covered: the end of the month that holds the day before
 * "today plus N months", inclusive.
 *
 * It used to be the end of the month `N - 1` ahead, which counted the current
 * month as one of the N however little was left of it. On the 30th, "one
 * month" was a single day — the whole plan, its verdict and its headline
 * figure were about tomorrow — and "three months" was two and a day. Now N
 * months always holds at least N months of calendar ahead of today, rounded
 * out to a month end so the chart and the bars still close on whole months:
 *
 * - 30 Sep, 1 month → 31 Oct; 3 months → 31 Dec.
 * - 1 Sep, 1 month → 30 Sep, since from the 1st a calendar month is exactly
 *   a month and nothing needs rounding out.
 * - 14 Aug, 1 month → 30 Sep; 3 → 30 Nov; 6 → 28 Feb.
 *
 * `addMonths` clamps rather than overflowing (31 Aug + 6 months is 28 Feb, not
 * 3 March), which is what keeps a start on the 29th–31st inside the right
 * month. Put another way: from the 1st this is the end of month `N - 1`
 * ahead, and from any other day the end of month `N` ahead.
 */
export function horizonEnd(horizon: PlannerHorizon, now: Date = new Date()): Date {
  return endOfMonth(addDays(addMonths(startOfDay(now), horizonMonths(horizon)), -1));
}

// ─── Recurring bills in the window ───────────────────────────────────────────

/**
 * Every time a bill falls due between `from` and `to`.
 *
 * Looking more than one month ahead means a monthly bill has to appear once per
 * month, not once in total — otherwise a three-month view quietly drops two
 * thirds of the electricity. Occurrences step from the bill's own period anchor
 * so custom intervals (every 2 months, quarterly) stay aligned.
 *
 * Each occurrence is the due date of its own period, worked out from the bill's
 * own day of the month — never a date stepped on from the one before. Stepping
 * carried the first month's clamp along with it: seen from September, a bill
 * due on the 31st started on the 30th and stayed there, landing on 30 October
 * and 30 December; seen from February it sat on the 28th for the rest of the
 * year. The period is stepped instead, and the day clamped afresh inside each
 * month: 31 October, 30 November, 31 December, 28 or 29 February.
 */
export function billOccurrences(bill: BillWithStatus, from: Date, to: Date): { date: Date; deadline: Date; amount?: number }[] {
  const firstPeriod = getPeriodStart(bill, from);
  if (!getPeriodDueDate(bill, firstPeriod)) return [];

  const occurrences: { date: Date; deadline: Date; amount?: number }[] = [];
  const installments = getInstallmentCount(bill);
  const periodTotal = round2(bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);
  // A generous cap: twelve months of a weekly bill is ~52. The loop must not
  // depend on the data being sane.
  for (let i = 0; i < 120; i++) {
    const due = getPeriodDueDate(bill, shiftPeriodStart(bill, firstPeriod, i));
    if (!due) break;
    const date = startOfDay(due);
    if (date > to) break;

    // The holiday house over the winter: not charged, so not in the plan. Asked
    // of the period's date, so a paused period takes all its instalments with it.
    if (isPausedOn(bill, date)) continue;

    const periodKey = getPeriodKey(bill, date);

    // No lower bound beyond "unpaid": stepping starts at the period `from`
    // falls in, so the earliest occurrence is the one currently owed. Skipping
    // it because its date has passed would quietly drop the bill you are late
    // on — exactly the one the plan must account for.
    if (installments === 1) {
      if (!bill.payments.some((p) => p.periodKey === periodKey)) occurrences.push({ date, deadline: getDeadline(bill, date) ?? date });
    } else {
      // Paid in parts, so the plan has to expect the parts: charging a gym year
      // as one €360 hit in October would put a hole in a month that only ever
      // sees €120 leave.
      const settledHere = paidInstallments(bill.payments, periodKey);
      installmentDueDates(bill, date).forEach((partDate, index) => {
        if (settledHere.has(index) || partDate > to) return;
        occurrences.push({ date: partDate, deadline: getDeadline(bill, partDate) ?? partDate, amount: installmentAmount(bill, periodTotal, index) });
      });
    }
  }

  return occurrences;
}

// ─── The plan ────────────────────────────────────────────────────────────────

/**
 * A figure the user has written themselves: "food, €200 a month".
 *
 * Costs only, now. A line of kind "income" is what an older Planner stored for
 * money in; those were carried over to «Έσοδα» once (`migratePlannerIncomes`)
 * and are left in storage untouched, but nothing plans with them any more —
 * `buildPlan` passes them by, and the page neither shows nor offers them.
 */
export interface BudgetLine {
  id: string;
  label: string;
  /** Per month, always positive — `kind` carries the direction. */
  amount: number;
  kind: "income" | "expense";
  /** First month it runs, "YYYY-MM". Absent means it has always been running. */
  from?: string;
  /** Last month it runs, inclusive. Absent means it never stops. */
  to?: string;
  /**
   * The season comes back on the same months every year.
   *
   * Ski from December to April is not one winter, and three trips a year are
   * not three trips: without this they had to be written out again for every
   * year the plan looked at, which is exactly the work a planner is for.
   */
  yearly?: boolean;
  /** "YYYY-MM" — the last month a yearly season runs. Absent means it never stops. */
  until?: string;
}

// ─── Seasons ────────────────────────────────────────────────────────────────

/**
 * A budget line that only runs for part of the year.
 *
 * "€200 a month for skiing, December to April" is neither a bill nor a
 * one-off: it is a rate, like every other budget line, but one that starts and
 * stops. Without the two ends it had to be entered as a flat monthly cost,
 * which quietly charged the summer for a lift pass — and made the whole year
 * look worse than it is.
 *
 * Months rather than days, because that is the shape of the thing: nobody
 * budgets a season to the 14th.
 */
export type MonthKey = string;

/** Parses "YYYY-MM" to the first day of that month, or undefined if unusable. */
export function monthStart(value: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return undefined;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return undefined;
  return new Date(Number(match[1]), month, 1);
}

/** "YYYY-MM" for a date, which is what the month inputs hand back. */
export const toMonthKey = (date: Date): MonthKey => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** A stretch of the window a line is charged over, as day offsets from today. */
export interface LineRange {
  from: number;
  to: number;
}

/** Trims a stretch to the window, or drops it when none of it is inside. */
function clampRange(from: number, to: number, days: number): LineRange | undefined {
  const start = Math.max(from, 0);
  const end = Math.min(to, days);
  return end >= start ? { from: start, to: end } : undefined;
}

/**
 * Every stretch of the window a line is actually charged over.
 *
 * One stretch for a plain line — the whole window — or for a season that
 * happens once. A yearly season returns one stretch per year it comes back in,
 * which is what lets "December to April, every year" cost the same in the
 * third winter as in the first without being written out three times.
 *
 * Empty means the line costs nothing here: the caller says so with a note
 * rather than dropping the row, so a ski budget entered in September is still
 * visible in a one-month window.
 */
export function lineRanges(line: BudgetLine, today: Date, days: number): LineRange[] {
  const seasonStart = monthStart(line.from);
  const seasonEnd = monthStart(line.to);
  if (!seasonStart && !seasonEnd) return [{ from: 0, to: days }];

  // Inclusive of the whole closing month: a season "to April" runs to 30 April.
  const endOfSeason = (month: Date) => differenceInCalendarDays(endOfMonth(month), today);

  // A repeat needs a month to repeat from. Without one there is nothing to add
  // a year to, so the line keeps its plain behaviour rather than guessing.
  if (!line.yearly || !seasonStart) {
    const once = clampRange(seasonStart ? differenceInCalendarDays(seasonStart, today) : 0, seasonEnd ? endOfSeason(seasonEnd) : days, days);
    return once ? [once] : [];
  }

  // A season with no end is a single month — one trip in August, rather than
  // August onwards forever, which is what a line with no season already means.
  const closes = seasonEnd && seasonEnd >= seasonStart ? seasonEnd : seasonStart;
  const stop = monthStart(line.until);
  const lastDay = stop ? Math.min(endOfSeason(stop), days) : days;

  // Started from the year the season last opened rather than from the year it
  // was first written: a winter budget entered in 2020 should not walk five
  // years of dead seasons to reach this one.
  const firstYear = Math.max(today.getFullYear() - seasonStart.getFullYear() - 1, 0);

  const ranges: LineRange[] = [];
  for (let year = firstYear; year < firstYear + 15; year++) {
    const from = differenceInCalendarDays(addYears(seasonStart, year), today);
    if (from > lastDay) break;

    const range = clampRange(from, Math.min(endOfSeason(addYears(closes, year)), lastDay), days);
    if (range) ranges.push(range);
  }
  return ranges;
}

/**
 * Months of budget between two day offsets.
 *
 * The same reckoning as the window's own `monthsCovered` — a part month is the
 * fraction of its days that fall inside — but for one line's season rather than
 * for the whole horizon.
 */
export function monthsBetween(today: Date, from: number, to: number): number {
  if (to < from) return 0;
  let months = 0;
  let cursor = startOfMonth(addDays(today, from));
  const last = addDays(today, to);

  while (cursor <= last) {
    const inMonth = getDaysInMonth(cursor);
    const first = Math.max(differenceInCalendarDays(cursor, today), from);
    const stop = Math.min(differenceInCalendarDays(addDays(cursor, inMonth - 1), today), to);
    if (stop >= first) months += (stop - first + 1) / inMonth;
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/**
 * Money arriving on a day you already know — once, or on a cadence.
 *
 * Income only, and deliberately so: this exists for the pay you get beyond the
 * twelve — a fourteenth salary split across three known dates — rather than as
 * a general "something happens on a day" record. Costs that land on a date are
 * bills, and bills already have a screen that does far more for them than this
 * could.
 *
 * The budget lines are rates — "€200 of food a month" — which is the right
 * shape for what recurs and the wrong shape for this. €1,400 on 20 December is
 * not €117 a month; it is a date, and a plan that flattened it would show a
 * comfortable year and a surprise every December.
 *
 * The date is kept as a plain "YYYY-MM-DD" string, because that is what a date
 * field hands over and what localStorage can hold without a revival step.
 */
export interface OneOff {
  id: string;
  label: string;
  /** Always positive: it is money in. */
  amount: number;
  /** "YYYY-MM-DD" — the first day it lands, or the only one. */
  date: string;
  /**
   * Months between repeats. Absent means it happens once.
   *
   * A bond coupon every three months is the same amount on the same day of the
   * quarter, forever; entering it as four separate dates a year meant writing
   * it out again every January, and a plan looking three years ahead needed
   * twelve of them.
   */
  every?: number;
  /** "YYYY-MM-DD" — the last day it may land. Absent means it keeps coming. */
  until?: string;
}

/** The longest gap offered, matching what a bill's own interval allows. */
export const MAX_REPEAT_MONTHS = 24;

/** The cadences the editor offers: monthly, alternate months, quarterly, half-yearly, yearly. */
export const REPEAT_CHOICES: readonly number[] = [1, 2, 3, 6, 12] as const;

/** A stored interval, or undefined when it is absent, nonsense, or out of range. */
export function repeatMonths(every: unknown): number | undefined {
  const months = typeof every === "number" ? Math.round(every) : NaN;
  return Number.isFinite(months) && months >= 1 && months <= MAX_REPEAT_MONTHS ? months : undefined;
}

/** i18n key and count for a cadence, so "every 12 months" reads as "every year". */
export function repeatLabel(months: number): { key: string; count: number } {
  if (months === 1) return { key: "planner.repeatEveryMonth", count: 1 };
  if (months % 12 === 0) return { key: months === 12 ? "planner.repeatEveryYear" : "planner.repeatEveryNYears", count: months / 12 };
  return { key: "planner.repeatEveryNMonths", count: months };
}

/** Parses a stored one-off date at local midnight, or undefined if it is rubbish. */
export function oneOffDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return undefined;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // `new Date(2026, 1, 31)` silently becomes 3 March; reject rather than move it.
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? date : undefined;
}

/**
 * Every day this entry lands inside a window.
 *
 * Stepped from the first date's month index rather than by adding a month to
 * the one before, so a coupon paid on the 31st does not walk itself back to the
 * 28th the first time it crosses February and stay there.
 */
export function oneOffDates(oneOff: OneOff, from: Date, to: Date): Date[] {
  const first = oneOffDate(oneOff.date);
  if (!first) return [];

  const every = repeatMonths(oneOff.every);
  if (!every) return first >= from && first <= to ? [first] : [];

  const until = oneOffDate(oneOff.until ?? "");
  const last = until && until < to ? until : to;

  const dates: Date[] = [];
  // The window is at most ten years, so a monthly repeat lands 120 times; the
  // ceiling is only here so a corrupt interval cannot spin forever.
  for (let i = 0; i < 600; i++) {
    const date = clampDay(first.getFullYear(), first.getMonth() + i * every, first.getDate());
    if (date > last) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

/**
 * The next time this entry lands on or after `from`, ignoring the horizon.
 *
 * The list needs this to tell "not in the months you are looking at" from
 * "finished", and a repeat that has not finished always has a next date even
 * when the current window is too short to hold one.
 */
export function nextOneOffDate(oneOff: OneOff, from: Date): Date | undefined {
  const first = oneOffDate(oneOff.date);
  if (!first) return undefined;
  if (first >= from) return first;

  const every = repeatMonths(oneOff.every);
  if (!every) return undefined;
  const until = oneOffDate(oneOff.until ?? "");

  // Jump to the cycle that reaches `from` rather than walking every one of the
  // hundreds a monthly repeat entered years ago would have.
  const monthsGap = (from.getFullYear() - first.getFullYear()) * 12 + (from.getMonth() - first.getMonth());
  let cycle = Math.max(Math.floor(monthsGap / every), 0);

  // The floor can land just short — a day-of-month later in the month than
  // today's — so step on until it clears, which takes at most a cycle or two.
  for (let guard = 0; guard < 4; guard++, cycle++) {
    const date = clampDay(first.getFullYear(), first.getMonth() + cycle * every, first.getDate());
    if (date >= from) return until && date > until ? undefined : date;
  }
  return undefined;
}

export type PlannerEventKind = "income" | "bill" | "goal";

export interface PlannerEvent {
  kind: PlannerEventKind;
  label: string;
  /** Positive is money arriving, negative is money leaving. */
  amount: number;
  date: Date;
  billId?: string;
  /** The income from «Έσοδα» this is a time of. */
  incomeId?: string;
  /**
   * A time of the salary — the income marked «ο μισθός μου». Pay day is where
   * the plan is cut (`payCycles`) and what "until pay day" runs to
   * (`paydayOutlook`); every other income is money in like any other.
   */
  pay?: boolean;
  /**
   * Days of slack this bill actually has. Zero means the due date is the hard
   * limit — a strict subscription that merely happens to fall after payday can
   * still not be put off, so slack has to come from the bill's own grace
   * period rather than from where it sits in the calendar.
   */
  graceDays?: number;
  /** Last day it can be paid. Only differs from `date` when there is grace. */
  deadline?: Date;
  /** Bill whose due date has already gone. */
  overdue?: boolean;
  /** Set when the plan checked this one against the records — see `plannerActuals`. */
  occurrenceKey?: string;
  /** Its day has passed and it has not come: held in the plan from today. */
  late?: boolean;
  /** The day it was expected, when it now sits on another. */
  expected?: Date;
}

/** "income": an income from «Έσοδα», the salary among them. */
export type PlanRowSource = "income" | "bill" | "goal" | "line" | "debt" | "oneoff";

/** One line of the plan as the page lists it: what it is, and what it costs over the window. */
export interface PlanRow {
  id: string;
  source: PlanRowSource;
  label: string;
  /** Signed total across the whole window. Zero when switched off. */
  total: number;
  /** Times it lands. Absent for the budget lines, which accrue by the day. */
  occurrences?: number;
  /** Signed monthly figure, for rows entered as a rate rather than as dates. */
  perMonth?: number;
  /**
   * Which side a budget line was entered on.
   *
   * Carried explicitly because the sign of `perMonth` cannot answer it: a line
   * sitting at zero — the state every line passes through while its amount is
   * being retyped — is neither positive nor negative, and a page grouping by
   * sign made that row vanish from both lists mid-keystroke, indistinguishable
   * from having been deleted.
   */
  kind?: BudgetLine["kind"];
  /** An income: what one time of it brings — its figure, or a variable one's mean. */
  each?: number;
  /** The income marked «ο μισθός μου». */
  pay?: boolean;
  /**
   * Why a row costs nothing in this window.
   *
   * A bill with no payment due — because this month is already paid, or because
   * it has no due date to schedule from — used to be dropped from the plan
   * altogether. That reads as the bill having gone missing rather than as it
   * having nothing to charge, so every active bill and goal now gets a row and
   * this says which case it is.
   */
  note?: "paid" | "undated" | "funded" | "outofseason" | "paused";
  enabled: boolean;
}

/**
 * How finely the balance line is sampled.
 *
 * A three-year window has about 1,100 days in it. Drawn one point per day that
 * is 1,100 nodes of SVG for a line nobody can read anyway — the shape of a
 * three-year plan is monthly, and the daily wobble is noise at that width. The
 * walk underneath stays daily either way, so the figures do not change; only
 * how many of them are kept.
 */
export type PointStep = "day" | "week" | "month";

/**
 * The longest window still drawn a day at a time.
 *
 * A three-month window is the rest of this month plus three whole months, so
 * it is always shorter than four whole months — and four months back to back
 * hold at most 123 days (July to October: 31 + 31 + 30 + 31). The threshold
 * used to be 92, three whole months, which was right while "three months"
 * meant this one and two more; once the rest of the current month came on top,
 * a three-month plan started on the 2nd switched to weekly points and its
 * readout jumped a week at a time.
 */
export const DAILY_POINTS_MAX_DAYS = 123;

export function pointStepFor(days: number): PointStep {
  if (days <= DAILY_POINTS_MAX_DAYS) return "day";
  if (days <= 550) return "week";
  return "month";
}

/** Last day of a week or a month — the balance at the end of the period. */
function isPointBoundary(step: PointStep, date: Date, offset: number): boolean {
  if (step === "day") return true;
  // The last day of a month is a point whatever the step. The page reads a
  // month's closing balance off the last point inside it, and at weekly
  // sampling that was whichever Sunday came last — up to six days early, and
  // on the wrong side of a payday. The same February then read as -279 on a
  // one-year view and as a healthy month on a two-year one, purely because the
  // horizon had changed how often the line was sampled.
  if (date.getDate() === getDaysInMonth(date)) return true;
  return step === "week" && offset % 7 === 6;
}

export interface ProjectionPoint {
  date: Date;
  balance: number;
  events: PlannerEvent[];
  /**
   * Budget-line money that accrued since the previous point, positive.
   *
   * The lines never land on a date, so they produce no events — and the chart
   * built its bars from events alone. A plan whose outgoings are all budget
   * lines therefore drew no outgoing bar at all while the balance fell away
   * underneath it: three trips a year and a ski season, and the only thing on
   * screen was the pay coming in.
   */
  accruedIn: number;
  accruedOut: number;
}

/**
 * The walk itself, one entry per day of the window — index 0 is today — kept
 * whatever the points are sampled at.
 *
 * The points thin out past four months, to a week and then a month apart,
 * because a line three years long has no use for 1,100 dots. But the questions
 * the page asks of a plan do not thin out with it: what is left on the eve of
 * each pay day is one particular day, and at weekly sampling that day is
 * usually not a point at all. Three arrays of a few thousand numbers each cost
 * nothing next to the walk that fills them.
 */
export interface DailyWalk {
  /** Balance at the end of each day, unrounded — the figure each point rounds. */
  balance: Float64Array;
  /** What the budget lines accrued on each day, each side, positive. */
  lineIn: Float64Array;
  lineOut: Float64Array;
}

export type PlannerVerdict = "ok" | "tight" | "short";

export interface PlannerPlan {
  start: Date;
  end: Date;
  /** Whole months the horizon asked for. */
  months: number;
  /** Days covered, today included. */
  days: number;
  /** Months of budget the window actually contains — the current one is part-spent. */
  monthsCovered: number;
  /** What the user says is in hand at the start. Nothing derives it. */
  openingBalance: number;
  rows: PlanRow[];
  events: PlannerEvent[];
  incomeTotal: number;
  billsTotal: number;
  goalsTotal: number;
  budgetTotal: number;
  debtsTotal: number;
  outgoingTotal: number;
  /** Income less outgoings across the window, before the opening balance. */
  net: number;
  endingBalance: number;
  points: ProjectionPoint[];
  /** How far apart those points are — the page labels them accordingly. */
  pointStep: PointStep;
  /** Every day of the walk, for the questions a sampled line cannot answer — see `DailyWalk`. */
  daily: DailyWalk;
  lowestBalance: number;
  /**
   * The day `lowestBalance` is reached — the first such day, when the line sits
   * at its low for more than one.
   *
   * Kept apart from `breaksOn` because they are rarely the same day: the line
   * goes under on the day of the first bill it cannot meet and keeps falling
   * until the pay comes. Printing the deepest figure beside the first day under
   * told the owner he would be €489.15 down on 1 October, when 1 October was
   * −€69.68 and −€489.15 was the 29th.
   */
  lowestOn: Date;
  breaksOn?: Date;
  /** The outgoing that tipped it under, when one thing did it. */
  breakingEvent?: PlannerEvent;
  /**
   * Every time an income is expected, every loan instalment and one-off near
   * today, with what became of it — arrived, late, still to come. Empty when
   * the plan was built without the records to check against.
   */
  occurrences: ResolvedOccurrence[];
  /**
   * Read off the running balance, the money in hand included: `ok` never goes
   * under zero, `tight` goes under and is back above by the end, `short` ends
   * under. See the note where it is worked out.
   */
  verdict: PlannerVerdict;
  /**
   * `net` when it is positive: what the window adds, before the money you
   * start with. Not the verdict's figure any more — a secondary line, and one
   * that has to say what it is when it is shown.
   */
  surplus: number;
  /** How far `net` falls short, before the money you start with. Secondary, like `surplus`. */
  shortfall: number;
  /** How deep the running line goes under zero, when it does. */
  dip: number;
  /** What is left per day on top of everything already budgeted. */
  safeDailySpend: number;
}

export interface PlanInput {
  bills: BillWithStatus[];
  goals: InvestmentGoalWithStats[];
  /** The user's monthly costs. A line of kind "income" left by an older Planner is passed by. */
  lines?: BudgetLine[];
  /** Dated arrivals — a fourteenth salary, a coupon every three months. */
  oneOffs?: OneOff[];
  /** Only what the user owes — see `plannableDebts`. */
  debts?: DebtWithStatus[];
  /**
   * The regular money in, as «Έσοδα» keeps it: the salary (the one marked
   * «ο μισθός μου») and every other income. Archived ones count nowhere.
   */
  incomes?: Income[];
  openingBalance?: number;
  /** Rows switched off: a bill's, goal's, debt's, line's or one-off's id, or an income's. */
  skipIds?: ReadonlySet<string>;
  horizon?: PlannerHorizon;
  now?: Date;
  /**
   * The records, and the user's word on single occurrences. Given, each dated
   * item near today is checked against them before it is planned: one that has
   * already come is not counted again, one that is late is not forgotten.
   * Absent, the plan takes every appointment at its word, as it always did.
   */
  actuals?: Actuals;
}

export function buildPlan({ bills, goals, lines = [], oneOffs = [], debts = [], incomes = [], openingBalance = 0, skipIds = new Set(), horizon = MIN_HORIZON_MONTHS, now = new Date(), actuals }: PlanInput): PlannerPlan {
  const today = startOfDay(now);
  const end = horizonEnd(horizon, now);
  const days = Math.max(differenceInCalendarDays(end, today), 0);

  // ── Incomes ───────────────────────────────────────────────────────────────
  // First, and through the Incomes page's own resolver — see `planIncomes`.
  // What they find as theirs is handed to the resolver below as already
  // settled, so a one-off cannot claim the salary's record as well.
  const incomePlan = planIncomes(incomes, { today, end, days, skipIds, now, actuals });

  // Checking against the records looks back a little: something due last week
  // that has not come is still owed, and the plan has to see it to say so.
  const resolve = actuals ? createResolver(actuals, now, incomePlan.claimed) : undefined;
  const lookFrom = resolve ? lookbackStart(now) : today;
  const occurrences: ResolvedOccurrence[] = [...incomePlan.occurrences];
  /** Each expected item, checked when there is something to check it against; what is left to plan. */
  const settle = (planned: PlannedOccurrence[]): { date: Date; amount: number; key?: string; late?: boolean; expected?: Date }[] => {
    if (!resolve) return planned.map((o) => ({ date: o.date, amount: o.amount }));
    const resolved = planned.map(resolve);
    occurrences.push(...resolved);
    return resolved.flatMap((r) => (r.plannedDate ? [{ date: r.plannedDate, amount: r.plannedAmount, key: r.key, late: r.status === "late", expected: r.date }] : []));
  };

  // How much of a month's budget the window really holds. The current month is
  // already part spent, so charging a full €200 of food for the eleven days
  // left in it would answer a question nobody asked.
  //
  // Counted a month at a time rather than a day at a time: the day loop was
  // 1,100 `addDays` allocations for a three-year window, and each of them only
  // to ask which month it landed in.
  let monthsCovered = 0;
  for (let cursor = startOfMonth(today); cursor <= end; cursor = addMonths(cursor, 1)) {
    const inMonth = getDaysInMonth(cursor);
    const first = Math.max(differenceInCalendarDays(cursor, today), 0);
    const last = Math.min(differenceInCalendarDays(addDays(cursor, inMonth - 1), today), days);
    if (last >= first) monthsCovered += (last - first + 1) / inMonth;
  }

  // The incomes lead the rows, the salary first: what arrives is read before
  // what leaves.
  const rows: PlanRow[] = [...incomePlan.rows];
  const events: PlannerEvent[] = [...incomePlan.events];
  const isOn = (id: string) => !skipIds.has(id);

  // ── Bills ─────────────────────────────────────────────────────────────────

  for (const bill of bills.filter((b) => b.isActive)) {
    const occurrences = billOccurrences(bill, today, end);
    const amount = round2(bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);
    const enabled = isOn(bill.id);
    // Instalments carry their own figure; everything else costs the period total.
    const windowTotal = occurrences.reduce((sum, o) => sum + (o.amount ?? amount), 0);

    rows.push({
      id: bill.id,
      source: "bill",
      label: bill.name,
      total: enabled ? negate(windowTotal) : 0,
      occurrences: occurrences.length,
      perMonth: negate(amount),
      // Listed even at zero: a bill that is settled for this month has not
      // stopped existing, and hiding it makes the plan look like it forgot.
      // "Paid" would be a lie for a bill that is simply switched off for the
      // whole window, and it is the one reason a dated bill has nothing in it.
      note: occurrences.length > 0 ? undefined : currentPause(bill, today)?.state === "paused" || currentPause(bill, today)?.state === "ended" ? "paused" : getPeriodDueDate(bill, today) ? "paid" : "undated",
      enabled,
    });
    if (!enabled) continue;

    for (const occurrence of occurrences) {
      const overdue = occurrence.date < today;
      events.push({
        kind: "bill",
        label: bill.name,
        amount: -(occurrence.amount ?? amount),
        // Scheduled on the due date, not the deadline: that is when the money
        // actually tends to leave, and planning against the last possible day
        // would flatter the answer. Anything already past lands on day one.
        date: overdue ? today : occurrence.date,
        billId: bill.id,
        overdue,
        graceDays: getGraceDays(bill),
        deadline: occurrence.deadline,
      });
    }
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  const laterMonths: Date[] = [];
  for (let cursor = startOfMonth(addMonths(today, 1)); cursor <= end; cursor = addMonths(cursor, 1)) laterMonths.push(startOfDay(cursor));

  for (const goal of plannableGoals(goals)) {
    // This month wants whatever is still outstanding; later months want the full
    // target again, since nothing has been paid into them yet.
    const need = goalMonthlyNeed(goal, now);
    const target = goalMonthlyTarget(goal, now);
    // Only the months the goal actually reaches — see `goalMonthsAhead`.
    const months = goalMonthsAhead(goal, laterMonths);
    const total = need + target * months.length;

    const enabled = isOn(goal.id);
    rows.push({
      id: goal.id,
      source: "goal",
      label: goal.name,
      total: enabled ? negate(total) : 0,
      occurrences: (need > 0 ? 1 : 0) + (target > 0 ? months.length : 0),
      perMonth: negate(target),
      // Same reasoning as the bills: a goal you are keeping up with reports
      // zero rather than disappearing.
      note: total > 0 ? undefined : "funded",
      enabled,
    });
    if (!enabled || total <= 0) continue;

    if (need > 0) events.push({ kind: "goal", label: goal.name, amount: -need, date: today });
    if (target > 0) for (const month of months) events.push({ kind: "goal", label: goal.name, amount: -target, date: month });
  }

  // ── Debts owed ────────────────────────────────────────────────────────────
  // Money borrowed has to come back out, so the plan has to know. Charged on
  // the agreed date when there is one and on day one when there is not: an
  // undated debt is owed now, and pretending otherwise would leave it out of
  // every window until the day it was finally given a date.

  for (const debt of debts) {
    const enabled = isOn(debt.id);
    const label = debt.label || debt.person;

    // A loan is paid off a month at a time, and the plan has to say so. Dropping
    // the whole balance on the final due date put five years of a car loan into
    // one day of the forecast: the months in between looked comfortable and the
    // month of the due date looked ruinous, and neither was true.
    if (isLoan(debt)) {
      const instalment = monthlyInstalment(debt.amount, currentRate(debt), debt.termMonths ?? 0, debt.interestFreeMonths ?? 0);
      const payoff = loanPayoff(debt, 0, today);
      if (!payoff || instalment <= 0) continue;

      // Paid on the same day of the month the loan started on, stepped from the
      // month index so a loan taken on the 31st does not walk back to the 28th.
      const startDay = firestoreToDate(debt.date).getDate();
      const dates: Date[] = [];
      const placed: ReturnType<typeof settle> = [];
      // Counted in instalments still owed, not in months from this one.
      // `payoff.months` is how many payments the balance has left in it, and the
      // walk starts in the current month — whose instalment may already be paid,
      // or already matched to a repayment. Stopping after that many *months*
      // then quietly lost the last instalment: twelve of €100 with eight paid,
      // seen on the 29th after the 5th's had gone, planned €300 over three
      // payments against a balance of €400. So the walk runs until the balance
      // has been placed, or the window closes first.
      //
      // Last month's too when checking: an instalment not yet paid is still due.
      // The month ceiling is only a guard — the window is at most ten years, so
      // `end` stops the walk long before it — in case a date ever fails to compare.
      const owed = () => (enabled ? placed.length : dates.length);
      for (let month = resolve ? -1 : 0; owed() < payoff.months && month <= MAX_HORIZON_MONTHS + 1; month++) {
        const date = clampDay(today.getFullYear(), today.getMonth() + month, startDay);
        if (date < lookFrom) continue;
        if (date > end) break;
        dates.push(date);
        // Each one for what the loan's own schedule says that payment is: the
        // instalment, and a smaller last one for whatever is left. Charging a
        // full instalment for the last as well put up to one instalment more in
        // the plan than the balance and the interest to come add up to.
        const amount = -(payoff.schedule[placed.length]?.payment ?? instalment);
        // One at a time rather than as a batch: whether this instalment is still
        // to pay — or has already come off the balance — decides whether the
        // walk needs another month. Switched off, nothing is checked against the
        // records, and every date stands for one instalment of the count.
        if (enabled) placed.push(...settle([{ key: occurrenceKey("loan", debt.id, date), source: "loan", refId: debt.id, label, amount, date }]));
      }

      rows.push({
        id: debt.id,
        source: "debt",
        label: debt.person,
        total: enabled ? negate(placed.reduce((sum, p) => sum - p.amount, 0)) : 0,
        occurrences: enabled ? placed.length : dates.length,
        perMonth: -instalment,
        enabled,
      });
      for (const p of placed) events.push({ kind: "goal", label, amount: p.amount, date: p.date, occurrenceKey: p.key, late: p.late, expected: p.expected });
      continue;
    }

    const dueDate = debt.dueDate ? startOfDay(firestoreToDate(debt.dueDate)) : today;
    const date = dueDate < today ? today : dueDate;
    if (date > end) continue;

    rows.push({ id: debt.id, source: "debt", label: debt.person, total: enabled ? negate(debt.remaining) : 0, occurrences: 1, enabled });
    if (enabled) events.push({ kind: "goal", label, amount: -debt.remaining, date });
  }

  // ── Dated one-offs ────────────────────────────────────────────────────────
  // Landed on their own day rather than spread, which is the whole reason they
  // are entered separately from the monthly lines.

  for (const oneOff of oneOffs) {
    // One date or many: a repeat is the same entry landing on every date its
    // cadence reaches inside the window, so the row totals what the window
    // actually holds rather than one payment of it.
    const dates = oneOffDates(oneOff, lookFrom, end);
    if (!dates.length) continue;

    const enabled = isOn(oneOff.id);
    const amount = round2(oneOff.amount);
    const placed = enabled ? settle(dates.map((date) => ({ key: occurrenceKey("oneoff", oneOff.id, date), source: "oneoff" as const, refId: oneOff.id, label: oneOff.label, amount, date }))) : [];

    rows.push({ id: oneOff.id, source: "oneoff", label: oneOff.label, total: enabled ? round2(placed.reduce((sum, p) => sum + p.amount, 0)) : 0, occurrences: enabled ? placed.length : dates.length, kind: "income", enabled });
    for (const p of placed) events.push({ kind: "income", label: oneOff.label, amount: p.amount, date: p.date, occurrenceKey: p.key, late: p.late, expected: p.expected });
  }

  // ── The user's own budget lines ───────────────────────────────────────────
  // Accrued by the day rather than dropped on a date: "€200 of food a month" is
  // a rate, not an appointment, and spreading it keeps the line readable and
  // the current month honestly pro-rated.

  // A difference array rather than one running total: a seasonal line is only
  // charged between its two months, so the rate changes as the walk crosses a
  // season's edges. Two entries per stretch, then a running sum during the
  // walk — rather than re-testing every line on every day, which is what keeps
  // a yearly season as cheap to draw as a flat one.
  // Two of them rather than one net rate: the balance only needs the net, but
  // the chart has to show what arrives and what leaves as separate bars, and a
  // net rate cannot be taken apart again afterwards.
  const rateIn = new Float64Array(days + 2);
  const rateOut = new Float64Array(days + 2);

  // An income with no day yet — one carried over from the old income lines —
  // runs the same way: its month's figure spread over the month's days.
  for (const spread of incomePlan.spreads) {
    rateIn[spread.from] += spread.amount;
    rateIn[spread.to + 1] -= spread.amount;
  }

  // Money in is the incomes' now; an income line an older Planner stored is
  // passed by rather than counted a second time beside the income it became.
  for (const line of lines.filter((l) => l.kind !== "income")) {
    const enabled = isOn(line.id);
    // One stretch, or one per winter for a season that comes back every year.
    const seasons = lineRanges(line, today, days);
    // A season entirely outside the horizon costs nothing here, and says so
    // with a note rather than vanishing from the list.
    const months = seasons.reduce((sum, season) => sum + monthsBetween(today, season.from, season.to), 0);

    const total = enabled ? negate(line.amount * months) : 0;

    rows.push({
      id: line.id,
      source: "line",
      label: line.label,
      total,
      perMonth: -line.amount,
      kind: "expense",
      note: seasons.length ? undefined : "outofseason",
      enabled,
    });
    if (!enabled) continue;

    for (const season of seasons) {
      rateOut[season.from] += line.amount;
      rateOut[season.to + 1] -= line.amount;
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── Walk the days ─────────────────────────────────────────────────────────

  // The running balance is kept unrounded and only rounded on the way into a
  // point. Rounding each daily slice instead would drift a cent a day away from
  // the row totals above, and the page shows both as one sum.
  let balance = openingBalance;
  const points: ProjectionPoint[] = [];
  let lowestBalance = Number.POSITIVE_INFINITY;
  let lowestOn = today;
  let breaksOn: Date | undefined;
  let breakingEvent: PlannerEvent | undefined;

  // Events bucketed by day once, rather than scanned for every day of the
  // window. The filter inside the loop was O(days x events): three years of a
  // busy plan is about 1,100 days against 200 events, which is 220,000 date
  // comparisons before a single pixel is drawn — and it was the freeze.
  const byDay = new Map<number, PlannerEvent[]>();
  for (const event of events) {
    const key = differenceInCalendarDays(event.date, today);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  const step = pointStepFor(days);
  // Events since the last point was emitted, so a coarse point still knows
  // everything that happened inside it.
  let pending: PlannerEvent[] = [];

  // The deepest day since the last point was kept.
  //
  // Sampling by month keeps the last day of each month, and with pay landing
  // late in the month that is the best day of it: a plan that spent three weeks
  // under zero and recovered on payday drew as a comfortable line, and the dip
  // the whole page exists to warn about disappeared as soon as the horizon
  // passed eighteen months. Keeping the low of each stretch as well makes the
  // line an envelope of what actually happens rather than a monthly snapshot.
  let lowBalance = Number.POSITIVE_INFINITY;
  let lowOffset = -1;
  // How much of `pending` had already happened by that day, so the two points
  // split the events between them instead of both claiming all of them.
  let lowPending = 0;
  let lastKept = openingBalance;

  // One mutable cursor rather than a fresh Date per day, and the month length
  // recomputed only when the month turns. A Date object is allocated only for
  // the points actually kept.
  const cursor = new Date(today);
  let daysInMonth = getDaysInMonth(cursor);
  // The budget lines running on the day being walked, each side kept apart.
  let monthlyIn = 0;
  let monthlyOut = 0;
  // Accrued since the last point was kept, for the bars.
  let accruedIn = 0;
  let accruedOut = 0;
  const daily: DailyWalk = { balance: new Float64Array(days + 1), lineIn: new Float64Array(days + 1), lineOut: new Float64Array(days + 1) };

  for (let offset = 0; offset <= days; offset++) {
    if (offset > 0) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDate() === 1) daysInMonth = getDaysInMonth(cursor);
    }
    monthlyIn += rateIn[offset];
    monthlyOut += rateOut[offset];
    const inToday = monthlyIn / daysInMonth;
    const outToday = monthlyOut / daysInMonth;
    balance += inToday - outToday;
    accruedIn += inToday;
    accruedOut += outToday;

    const dayEvents = byDay.get(offset) ?? [];
    for (const event of dayEvents) balance += event.amount;
    if (dayEvents.length > 0) pending = pending.concat(dayEvents);
    daily.balance[offset] = balance;
    daily.lineIn[offset] = inToday;
    daily.lineOut[offset] = outToday;

    // Compared to the cent, like everything the page prints. The walk adds a
    // line's daily slice as a fraction, so a month that nets to exactly zero
    // can land a hair either side of it; unrounded, a balance of −0.0000001
    // "went under" on a day the screen shows as 0,00 €, and the lowest day
    // could move to a later one that differs by nothing a person can see.
    if (round2(balance) < round2(lowestBalance)) {
      lowestBalance = balance;
      lowestOn = new Date(cursor);
    }
    if (balance < lowBalance) {
      lowBalance = balance;
      lowOffset = offset;
      lowPending = pending.length;
    }
    if (round2(balance) < 0 && !breaksOn) {
      breaksOn = new Date(cursor);
      const outgoings = dayEvents.filter((e) => e.amount < 0);
      breakingEvent = outgoings.length > 0 ? outgoings.reduce((big, e) => (e.amount < big.amount ? e : big)) : undefined;
    }

    // The balance is still walked one day at a time — it has to be, or a bill
    // landing mid-period would be lost — but only the boundaries are kept.
    if (offset === days || isPointBoundary(step, cursor, offset)) {
      // Only a dip that goes under earns a point of its own. Drawing the low of
      // every stretch was accurate and unreadable — a saw-tooth across three
      // years of a plan that never actually runs out — while the one thing the
      // line must never hide is the month that ends in the red. A low that is
      // merely where the stretch began, or the boundary day itself, says
      // nothing either.
      const dips = lowOffset >= 0 && lowOffset < offset && round2(lowBalance) < 0 && round2(lowBalance) < Math.min(round2(lastKept), round2(balance));
      if (dips) {
        // The accrual is flushed with the boundary point below rather than split
        // here: both points fall inside the same period, so the period's total
        // is the same either way and the split would be arbitrary.
        points.push({ date: addDays(today, lowOffset), balance: round2(lowBalance), events: pending.slice(0, lowPending), accruedIn: 0, accruedOut: 0 });
        pending = pending.slice(lowPending);
      }

      // Kept unrounded: these are summed a period at a time and rounded there.
      // Rounding each point instead drifted the bars a cent per point away from
      // the totals the rows report — eight of them over three years.
      points.push({ date: new Date(cursor), balance: round2(balance), events: pending, accruedIn, accruedOut });
      pending = [];
      accruedIn = 0;
      accruedOut = 0;
      lastKept = balance;
      lowBalance = Number.POSITIVE_INFINITY;
      lowOffset = -1;
      lowPending = 0;
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const sumOf = (match: (row: PlanRow) => boolean) => round2(rows.filter(match).reduce((sum, row) => sum + Math.abs(row.total), 0));

  const incomeTotal = sumOf((r) => r.total > 0);
  const billsTotal = sumOf((r) => r.source === "bill");
  const goalsTotal = sumOf((r) => r.source === "goal");
  const budgetTotal = sumOf((r) => r.source === "line" && r.total < 0);
  const debtsTotal = sumOf((r) => r.source === "debt");
  const outgoingTotal = round2(billsTotal + goalsTotal + budgetTotal + debtsTotal);

  const endingBalance = points.length > 0 ? points[points.length - 1].balance : round2(openingBalance);
  const net = round2(incomeTotal - outgoingTotal);

  // The verdict is read off the running balance, which starts from the money
  // in hand. It used to be read off `net` — income less outgoings over the
  // window, with the money already there left out — which answered "do the
  // months pay for themselves" when the question on the screen is "will I be
  // all right". Someone with €1,200 in the bank and a month that costs €200
  // more than it brings was told the months do not add up; someone with
  // nothing and a month €393 to the good was shown "393 €" as if it were money
  // they would have, when the line spent three weeks under zero on the way.
  //
  // Now: never under zero is `ok`; under at some point but back above by the
  // end is `tight` — the timing is wrong rather than the arithmetic, which is a
  // different problem from running out; ending under is `short`. `net` and the
  // figures made from it stay on the plan, for a line that says what they are.
  const dip = round2(lowestBalance) < 0 ? round2(-lowestBalance) : 0;
  const surplus = Math.max(net, 0);
  const shortfall = net < 0 ? round2(-net) : 0;
  const verdict: PlannerVerdict = endingBalance < 0 ? "short" : dip > 0 ? "tight" : "ok";

  return {
    start: today,
    end,
    months: horizonMonths(horizon),
    days,
    monthsCovered: Math.round(monthsCovered * 100) / 100,
    openingBalance: round2(openingBalance),
    rows,
    events,
    incomeTotal,
    billsTotal,
    goalsTotal,
    budgetTotal,
    debtsTotal,
    outgoingTotal,
    net,
    endingBalance,
    points,
    pointStep: pointStepFor(days),
    daily,
    lowestBalance: round2(lowestBalance),
    lowestOn,
    breaksOn,
    breakingEvent,
    occurrences,
    verdict,
    surplus,
    shortfall,
    dip,
    safeDailySpend: days > 0 ? round2(Math.max(round2(openingBalance) + incomeTotal - outgoingTotal, 0) / (days + 1)) : 0,
  };
}

/**
 * The line under the verdict: an i18n key, and the raw figures it is filled with.
 *
 * For a plan that dips, two facts on two different days: the first day under
 * zero, with the outgoing that took it there, and the lowest point, with its
 * own day. The old line printed the deepest figure beside the first day under
 * — "you go €489.15 under on 1 Oct" — when 1 October was −69.68 and −489.15
 * was the 29th. Each figure now sits with the day it belongs to.
 *
 * The same two facts for a plan that ends under as for one that dips and comes
 * back: both went under on some day, for some reason, and both have a deepest
 * point. Only the verdict above the line differs.
 *
 * A plan that never goes under says where it comes closest — the low point
 * and its day — because that, and not what the months add, is what the answer
 * rests on: you make it as long as that figure stays above zero.
 */
export type HeroSubline =
  | { key: "planner.dipsOn" | "planner.dipsOnBill"; date: Date; name?: string; lowest: number; lowestOn: Date }
  | { key: "planner.lowestPoint"; lowest: number; lowestOn: Date };

export function heroSubline(plan: Pick<PlannerPlan, "breaksOn" | "breakingEvent" | "lowestBalance" | "lowestOn">): HeroSubline {
  if (plan.breaksOn) {
    return { key: plan.breakingEvent ? "planner.dipsOnBill" : "planner.dipsOn", date: plan.breaksOn, name: plan.breakingEvent?.label, lowest: plan.lowestBalance, lowestOn: plan.lowestOn };
  }
  return { key: "planner.lowestPoint", lowest: plan.lowestBalance, lowestOn: plan.lowestOn };
}

// ─── The plan, period by period ─────────────────────────────────────────────

/**
 * One bar-pair of the expanded chart: what arrived, what left, where it ended.
 *
 * The line in the card answers "do I stay above zero". Given the room of the
 * full view it can answer the more useful question — *why* a month is tight —
 * and that needs the two sides apart rather than netted. A January where the
 * same salary met twice the outgoings looks identical to a January with no
 * salary once you have subtracted one from the other.
 */
export interface PlanPeriod {
  /** "2026-09", or "2026-Q4" when bucketed. */
  key: string;
  start: Date;
  income: number;
  /** Positive: what left, drawn downward. */
  outgoing: number;
  /** Running balance at the end of the period. */
  balance: number;
}

/**
 * Months, or quarters once there are too many months to draw.
 *
 * Three years is seventy-two bars; on a phone that is five pixels each, which
 * is a texture and not a chart. The same reasoning as the line's own day/week/
 * month step, and the same honesty: the figures are summed, never sampled.
 */
export const QUARTER_ABOVE_MONTHS = 18;

const quarterOf = (date: Date) => Math.floor(date.getMonth() / 3);

export function planPeriods(plan: Pick<PlannerPlan, "events" | "points" | "months" | "openingBalance">): PlanPeriod[] {
  const byQuarter = plan.months > QUARTER_ABOVE_MONTHS;

  const keyOf = (date: Date) => (byQuarter ? `${date.getFullYear()}-Q${quarterOf(date) + 1}` : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  const startOf = (date: Date) => (byQuarter ? new Date(date.getFullYear(), quarterOf(date) * 3, 1) : new Date(date.getFullYear(), date.getMonth(), 1));

  const periods = new Map<string, PlanPeriod>();
  const at = (date: Date) => {
    const key = keyOf(date);
    let period = periods.get(key);
    if (!period) {
      period = { key, start: startOf(date), income: 0, outgoing: 0, balance: 0 };
      periods.set(key, period);
    }
    return period;
  };

  // Totalled raw and rounded once at the end. Rounding on every addition drifts
  // half a cent at a time, and a day-sampled window adds ninety of them: the
  // bars came out eight cents away from the totals the rows report.
  for (const event of plan.events) {
    const period = at(event.date);
    if (event.amount > 0) period.income += event.amount;
    else period.outgoing -= event.amount;
  }

  // The closing balance of a period is the last point falling inside it. The
  // budget lines accrue daily and never appear as events, so adding the two
  // bars would miss them — the line has to come from the walk.
  //
  // Tracked separately from the figure itself: a period whose balance is
  // genuinely zero is not the same as one the walk never reached, and testing
  // `balance === 0` would confuse them.
  const measured = new Set<string>();
  for (const point of plan.points) {
    const period = at(point.date);
    period.balance = point.balance;
    // The budget lines accrue by the day and never land on a date, so they
    // reach the bars this way or not at all. Without them a plan whose costs
    // are all budget lines drew no outgoing bar while its balance fell.
    period.income += point.accruedIn;
    period.outgoing += point.accruedOut;
    measured.add(period.key);
  }

  const ordered = Array.from(periods.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const period of ordered) {
    period.income = round2(period.income);
    period.outgoing = round2(period.outgoing);
  }

  // A period the walk did not reach carries the previous one forward, so the
  // line stays flat through a quiet stretch rather than dropping to zero.
  let running = plan.openingBalance;
  for (const period of ordered) {
    if (!measured.has(period.key)) period.balance = running;
    running = period.balance;
  }

  return ordered;
}
