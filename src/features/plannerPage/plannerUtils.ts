import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, getDaysInMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { isEarning } from "../../shared/utils/moneyModel";
import { getDeadline, getGraceDays, getInstallmentCount, getIntervalCount, getPeriodDueDate, getPeriodKey, installmentAmount, installmentDueDates, paidInstallments } from "../bills/billsUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

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
// already commitments rather than guesses.

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Rounded and negated, without turning a zero row into `-0` and "−0,00 €". */
const negate = (n: number) => (n === 0 ? 0 : -round2(n));
const clampDay = (year: number, month: number, day: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));

// ─── Salary detection ────────────────────────────────────────────────────────

export interface SalaryPattern {
  /** Median of the recent occurrences — resistant to one unusual month. */
  amount: number;
  /** Day of month it usually lands on. */
  dayOfMonth: number;
  /** How many separate months it was seen in. Two is the minimum to call it a pattern. */
  occurrences: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Finds the recurring salary by taking the largest income in each recent month
 * and checking it repeats.
 *
 * "Largest per month" rather than "anything that looks regular" on purpose: a
 * salary is almost always the biggest thing that arrives, and that rule needs
 * no threshold to tune. Returns undefined rather than guessing from a single
 * month — one payment is a payment, not a pattern.
 *
 * This is only ever a suggestion for the salary field: the figure the plan uses
 * is whatever the user leaves in it.
 */
export function detectSalary(transactions: Transaction[], now: Date = new Date(), lookbackMonths = 4): SalaryPattern | undefined {
  const earliest = startOfMonth(subMonths(now, lookbackMonths));

  const biggestPerMonth = new Map<string, { amount: number; day: number }>();
  for (const tx of transactions.filter(isEarning)) {
    const date = firestoreToDate(tx.date);
    if (date < earliest || date > now) continue;

    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const amount = Math.abs(tx.amount);
    const current = biggestPerMonth.get(key);
    if (!current || amount > current.amount) biggestPerMonth.set(key, { amount, day: date.getDate() });
  }

  const found = Array.from(biggestPerMonth.values());
  if (found.length < 2) return undefined;

  return {
    amount: round2(median(found.map((f) => f.amount))),
    dayOfMonth: Math.round(median(found.map((f) => f.day))),
    occurrences: found.length,
  };
}

/** The next payday strictly after today. Falls back to the 1st when unknown. */
export function nextSalaryDate(dayOfMonth: number | undefined, now: Date = new Date()): Date {
  const day = dayOfMonth ?? 1;
  const today = startOfDay(now);

  const thisMonth = clampDay(today.getFullYear(), today.getMonth(), day);
  if (thisMonth > today) return thisMonth;
  return clampDay(today.getFullYear(), today.getMonth() + 1, day);
}

/**
 * Every payday between now and `end`.
 *
 * Stepped from the month index rather than by adding months to the last date,
 * so a salary on the 31st does not walk itself back to the 28th after February.
 */
export function salaryDates(dayOfMonth: number | undefined, end: Date, now: Date = new Date()): Date[] {
  const first = nextSalaryDate(dayOfMonth, now);
  const dates: Date[] = [];

  for (let i = 0; i < 400; i++) {
    const date = clampDay(first.getFullYear(), first.getMonth() + i, dayOfMonth ?? 1);
    if (date > end) break;
    dates.push(date);
  }

  return dates;
}

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

  if (goal.deadline) {
    const deadline = firestoreToDate(goal.deadline);
    const monthsAhead = Math.max((deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth()), 0);
    // Divided by the number of contributions, which is one more than the number
    // of months *ahead*: the plan charges this month as well as each later one.
    // Dividing by the gap alone made the slices too big by exactly one payment,
    // so a €900 goal three months out was planned as €1,350.
    // Deadline lands this month: the whole remainder is due now, not a slice.
    return round2((goal.remaining ?? 0) / (monthsAhead + 1));
  }

  return round2(goal.monthlyRequired ?? 0);
}

/** The full monthly target, ignoring what has already gone in this period. */
export function goalMonthlyTarget(goal: InvestmentGoalWithStats, now: Date = new Date()): number {
  if (goal.goalType === "open_ended") return 0;
  if (goal.targetPeriod === "monthly") return round2(goal.monthlyRequired ?? goal.targetAmount ?? 0);
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

/** Last day covered: the end of the month `months - 1` ahead, inclusive. */
export function horizonEnd(horizon: PlannerHorizon, now: Date = new Date()): Date {
  return endOfMonth(addMonths(startOfDay(now), horizonMonths(horizon) - 1));
}

// ─── Recurring bills in the window ───────────────────────────────────────────

/**
 * Every time a bill falls due between `from` and `to`.
 *
 * Looking more than one month ahead means a monthly bill has to appear once per
 * month, not once in total — otherwise a three-month view quietly drops two
 * thirds of the electricity. Occurrences step from the bill's own period anchor
 * so custom intervals (every 2 months, quarterly) stay aligned.
 */
export function billOccurrences(bill: BillWithStatus, from: Date, to: Date): { date: Date; deadline: Date; amount?: number }[] {
  const interval = getIntervalCount(bill);
  const step = (date: Date, times: number) =>
    bill.frequency === "weekly" ? addWeeks(date, interval * times) : bill.frequency === "yearly" ? addYears(date, interval * times) : addMonths(date, interval * times);

  const anchor = getPeriodDueDate(bill, from);
  if (!anchor) return [];

  const occurrences: { date: Date; deadline: Date; amount?: number }[] = [];
  const installments = getInstallmentCount(bill);
  const periodTotal = round2(bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);
  // A generous cap: twelve months of a weekly bill is ~52. The loop must not
  // depend on the data being sane.
  for (let i = 0; i < 120; i++) {
    const date = startOfDay(step(anchor, i));
    if (date > to) break;

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

/** A figure the user has written themselves: "food, €200 a month". */
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

/**
 * The day offsets a line is actually charged on, clamped to the window.
 *
 * Returns undefined when the season falls entirely outside the horizon — the
 * caller then charges nothing rather than charging a clamped remnant.
 */
export function lineDays(line: BudgetLine, today: Date, days: number): { from: number; to: number } | undefined {
  const seasonStart = monthStart(line.from);
  const seasonEnd = monthStart(line.to);

  const from = seasonStart ? differenceInCalendarDays(seasonStart, today) : 0;
  // Inclusive of the whole closing month: a season "to April" runs to 30 April.
  const to = seasonEnd ? differenceInCalendarDays(endOfMonth(seasonEnd), today) : days;

  const start = Math.max(from, 0);
  const end = Math.min(to, days);
  return end >= start ? { from: start, to: end } : undefined;
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
 * Money arriving once, on a day you already know.
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
  /** "YYYY-MM-DD" */
  date: string;
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

export type PlannerEventKind = "income" | "bill" | "goal";

export interface PlannerEvent {
  kind: PlannerEventKind;
  label: string;
  /** Positive is money arriving, negative is money leaving. */
  amount: number;
  date: Date;
  billId?: string;
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
}

export type PlanRowSource = "salary" | "bill" | "goal" | "line" | "debt" | "oneoff";

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
  /**
   * Why a row costs nothing in this window.
   *
   * A bill with no payment due — because this month is already paid, or because
   * it has no due date to schedule from — used to be dropped from the plan
   * altogether. That reads as the bill having gone missing rather than as it
   * having nothing to charge, so every active bill and goal now gets a row and
   * this says which case it is.
   */
  note?: "paid" | "undated" | "funded" | "outofseason";
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

export function pointStepFor(days: number): PointStep {
  if (days <= 92) return "day";
  if (days <= 550) return "week";
  return "month";
}

/** Last day of a week or a month — the balance at the end of the period. */
function isPointBoundary(step: PointStep, date: Date, offset: number): boolean {
  if (step === "day") return true;
  if (step === "week") return offset % 7 === 6;
  return date.getDate() === getDaysInMonth(date);
}

export interface ProjectionPoint {
  date: Date;
  balance: number;
  events: PlannerEvent[];
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
  nextSalary?: Date;
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
  lowestBalance: number;
  breaksOn?: Date;
  /** The outgoing that tipped it under, when one thing did it. */
  breakingEvent?: PlannerEvent;
  verdict: PlannerVerdict;
  /** `net` when it is positive. The headline figure when the answer is yes. */
  surplus: number;
  /** How far `net` falls short. The headline figure when the answer is no. */
  shortfall: number;
  /** How deep the running line goes under zero, when it does. */
  dip: number;
  /** What is left per day on top of everything already budgeted. */
  safeDailySpend: number;
}

export interface PlanInput {
  bills: BillWithStatus[];
  goals: InvestmentGoalWithStats[];
  lines?: BudgetLine[];
  /** Dated, single occurrences — a fourteenth salary, a known one-off cost. */
  oneOffs?: OneOff[];
  /** Only what the user owes — see `plannableDebts`. */
  debts?: DebtWithStatus[];
  salary?: SalaryPattern;
  openingBalance?: number;
  skipIds?: ReadonlySet<string>;
  horizon?: PlannerHorizon;
  now?: Date;
}

/** Row id for the salary, which has no document of its own to be keyed by. */
export const SALARY_ROW_ID = "__salary__";

export function buildPlan({ bills, goals, lines = [], oneOffs = [], debts = [], salary, openingBalance = 0, skipIds = new Set(), horizon = MIN_HORIZON_MONTHS, now = new Date() }: PlanInput): PlannerPlan {
  const today = startOfDay(now);
  const end = horizonEnd(horizon, now);
  const days = Math.max(differenceInCalendarDays(end, today), 0);

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

  const rows: PlanRow[] = [];
  const events: PlannerEvent[] = [];
  const isOn = (id: string) => !skipIds.has(id);

  // ── Salary ────────────────────────────────────────────────────────────────

  const paydays = salary ? salaryDates(salary.dayOfMonth, end, now) : [];
  if (salary) {
    const enabled = isOn(SALARY_ROW_ID);
    rows.push({
      id: SALARY_ROW_ID,
      source: "salary",
      label: SALARY_ROW_ID,
      total: enabled ? round2(salary.amount * paydays.length) : 0,
      occurrences: paydays.length,
      perMonth: salary.amount,
      enabled,
    });
    // Labelled with the row id rather than a word: the page translates this one
    // and prints every other income event's own name. Marking it by `kind`
    // instead meant a fourteenth salary, a room rent and every other line the
    // user had named were all relabelled "Salary" on the chart and the
    // timeline.
    if (enabled) for (const date of paydays) events.push({ kind: "income", label: SALARY_ROW_ID, amount: salary.amount, date });
  }

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
      note: occurrences.length > 0 ? undefined : getPeriodDueDate(bill, today) ? "paid" : "undated",
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
    const dueDate = debt.dueDate ? startOfDay(firestoreToDate(debt.dueDate)) : today;
    const date = dueDate < today ? today : dueDate;
    if (date > end) continue;

    rows.push({ id: debt.id, source: "debt", label: debt.person, total: enabled ? negate(debt.remaining) : 0, occurrences: 1, enabled });
    if (enabled) events.push({ kind: "goal", label: debt.label || debt.person, amount: -debt.remaining, date });
  }

  // ── Dated one-offs ────────────────────────────────────────────────────────
  // Landed on their own day rather than spread, which is the whole reason they
  // are entered separately from the monthly lines.

  for (const oneOff of oneOffs) {
    const date = oneOffDate(oneOff.date);
    if (!date || date < today || date > end) continue;

    const enabled = isOn(oneOff.id);
    const amount = round2(oneOff.amount);

    rows.push({ id: oneOff.id, source: "oneoff", label: oneOff.label, total: enabled ? amount : 0, occurrences: 1, kind: "income", enabled });
    if (enabled) events.push({ kind: "income", label: oneOff.label, amount, date });
  }

  // ── The user's own budget lines ───────────────────────────────────────────
  // Accrued by the day rather than dropped on a date: "€200 of food a month" is
  // a rate, not an appointment, and spreading it keeps the line readable and
  // the current month honestly pro-rated.

  // A difference array rather than one running total: a seasonal line is only
  // charged between its two months, so the rate changes as the walk crosses a
  // season's edges. Two entries per line, then a running sum during the walk —
  // rather than re-testing every line on every day.
  const rateDelta = new Float64Array(days + 2);

  for (const line of lines) {
    const enabled = isOn(line.id);
    const sign = line.kind === "income" ? 1 : -1;
    const season = lineDays(line, today, days);
    // A season entirely outside the horizon costs nothing here, and says so
    // with a note rather than vanishing from the list.
    const months = season ? monthsBetween(today, season.from, season.to) : 0;

    const total = enabled ? (line.kind === "income" ? round2(line.amount * months) : negate(line.amount * months)) : 0;

    rows.push({
      id: line.id,
      source: "line",
      label: line.label,
      total,
      perMonth: line.amount * sign,
      kind: line.kind,
      note: season ? undefined : "outofseason",
      enabled,
    });
    if (!enabled || !season) continue;

    rateDelta[season.from] += sign * line.amount;
    rateDelta[season.to + 1] -= sign * line.amount;
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── Walk the days ─────────────────────────────────────────────────────────

  // The running balance is kept unrounded and only rounded on the way into a
  // point. Rounding each daily slice instead would drift a cent a day away from
  // the row totals above, and the page shows both as one sum.
  let balance = openingBalance;
  const points: ProjectionPoint[] = [];
  let lowestBalance = Number.POSITIVE_INFINITY;
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

  // One mutable cursor rather than a fresh Date per day, and the month length
  // recomputed only when the month turns. A Date object is allocated only for
  // the points actually kept.
  const cursor = new Date(today);
  let daysInMonth = getDaysInMonth(cursor);
  // Net of every budget line running on the day being walked.
  let monthlyRate = 0;

  for (let offset = 0; offset <= days; offset++) {
    if (offset > 0) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDate() === 1) daysInMonth = getDaysInMonth(cursor);
    }
    monthlyRate += rateDelta[offset];
    balance += monthlyRate / daysInMonth;

    const dayEvents = byDay.get(offset) ?? [];
    for (const event of dayEvents) balance += event.amount;
    if (dayEvents.length > 0) pending = pending.concat(dayEvents);

    if (balance < lowestBalance) lowestBalance = balance;
    if (balance < 0 && !breaksOn) {
      breaksOn = new Date(cursor);
      const outgoings = dayEvents.filter((e) => e.amount < 0);
      breakingEvent = outgoings.length > 0 ? outgoings.reduce((big, e) => (e.amount < big.amount ? e : big)) : undefined;
    }

    // The balance is still walked one day at a time — it has to be, or a bill
    // landing mid-period would be lost — but only the boundaries are kept.
    if (offset === days || isPointBoundary(step, cursor, offset)) {
      points.push({ date: new Date(cursor), balance: round2(balance), events: pending });
      pending = [];
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

  // The verdict is about the months, not about the running total: "do three
  // salaries cover three months of everything" is the question asked, and it is
  // answered by `net`. Dipping below zero on the way is a separate, lesser
  // problem — the timing is wrong rather than the arithmetic — so it gets its
  // own verdict rather than being confused with running out altogether. Without
  // that split, anyone who has not typed an opening balance is told they will
  // run short the moment the first bill lands.
  const dip = lowestBalance < 0 ? round2(-lowestBalance) : 0;
  const surplus = Math.max(net, 0);
  const shortfall = net < 0 ? round2(-net) : 0;
  const verdict: PlannerVerdict = net < 0 ? "short" : dip > 0 ? "tight" : "ok";

  return {
    start: today,
    end,
    months: horizonMonths(horizon),
    days,
    monthsCovered: Math.round(monthsCovered * 100) / 100,
    nextSalary: paydays[0],
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
    lowestBalance: round2(lowestBalance),
    breaksOn,
    breakingEvent,
    verdict,
    surplus,
    shortfall,
    dip,
    safeDailySpend: days > 0 ? round2(Math.max(round2(openingBalance) + incomeTotal - outgoingTotal, 0) / (days + 1)) : 0,
  };
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

  for (const event of plan.events) {
    const period = at(event.date);
    if (event.amount > 0) period.income = round2(period.income + event.amount);
    else period.outgoing = round2(period.outgoing - event.amount);
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
    measured.add(period.key);
  }

  const ordered = Array.from(periods.values()).sort((a, b) => a.start.getTime() - b.start.getTime());

  // A period the walk did not reach carries the previous one forward, so the
  // line stays flat through a quiet stretch rather than dropping to zero.
  let running = plan.openingBalance;
  for (const period of ordered) {
    if (!measured.has(period.key)) period.balance = running;
    running = period.balance;
  }

  return ordered;
}
