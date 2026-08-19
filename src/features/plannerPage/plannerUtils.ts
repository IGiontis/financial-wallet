import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, getDaysInMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { isEarning } from "../../shared/utils/moneyModel";
import { getDeadline, getGraceDays, getIntervalCount, getPeriodDueDate, getPeriodKey } from "../bills/billsUtils";
import type { BillWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

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
    const monthsLeft = Math.max((deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth()), 0);
    // Deadline lands this month: the whole remainder is due now, not a slice.
    return round2(monthsLeft === 0 ? (goal.remaining ?? 0) : (goal.remaining ?? 0) / monthsLeft);
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

// ─── Horizon ─────────────────────────────────────────────────────────────────

export type PlannerHorizon = "1m" | "3m" | "6m" | "12m";

export const PLANNER_HORIZONS: readonly PlannerHorizon[] = ["1m", "3m", "6m", "12m"] as const;

const HORIZON_MONTHS: Record<PlannerHorizon, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };

/**
 * Anything that is not one of the current horizons, read back as the shortest.
 *
 * The horizon is persisted, so a browser can hand back a name from an older set
 * ("payday", "month") long after it stopped meaning anything. Left unchecked
 * that reaches `addMonths` as NaN and the whole page dies on an invalid date, so
 * the value is narrowed on the way in rather than trusted because its type says
 * so.
 */
export const asHorizon = (value: unknown): PlannerHorizon => ((PLANNER_HORIZONS as readonly unknown[]).includes(value) ? (value as PlannerHorizon) : "1m");

export const horizonMonths = (horizon: PlannerHorizon): number => HORIZON_MONTHS[asHorizon(horizon)];

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
export function billOccurrences(bill: BillWithStatus, from: Date, to: Date): { date: Date; deadline: Date }[] {
  const interval = getIntervalCount(bill);
  const step = (date: Date, times: number) =>
    bill.frequency === "weekly" ? addWeeks(date, interval * times) : bill.frequency === "yearly" ? addYears(date, interval * times) : addMonths(date, interval * times);

  const anchor = getPeriodDueDate(bill, from);
  if (!anchor) return [];

  const occurrences: { date: Date; deadline: Date }[] = [];
  // A generous cap: twelve months of a weekly bill is ~52. The loop must not
  // depend on the data being sane.
  for (let i = 0; i < 120; i++) {
    const date = startOfDay(step(anchor, i));
    if (date > to) break;

    const deadline = getDeadline(bill, date) ?? date;
    const settled = bill.payments.some((p) => p.periodKey === getPeriodKey(bill, date));

    // No lower bound beyond "unpaid": stepping starts at the period `from`
    // falls in, so the earliest occurrence is the one currently owed. Skipping
    // it because its date has passed would quietly drop the bill you are late
    // on — exactly the one the plan must account for.
    if (!settled) occurrences.push({ date, deadline });
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

export type PlanRowSource = "salary" | "bill" | "goal" | "line";

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
  enabled: boolean;
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
  outgoingTotal: number;
  /** Income less outgoings across the window, before the opening balance. */
  net: number;
  endingBalance: number;
  points: ProjectionPoint[];
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
  salary?: SalaryPattern;
  openingBalance?: number;
  skipIds?: ReadonlySet<string>;
  horizon?: PlannerHorizon;
  now?: Date;
}

/** Row id for the salary, which has no document of its own to be keyed by. */
export const SALARY_ROW_ID = "__salary__";

export function buildPlan({ bills, goals, lines = [], salary, openingBalance = 0, skipIds = new Set(), horizon = "1m", now = new Date() }: PlanInput): PlannerPlan {
  const today = startOfDay(now);
  const end = horizonEnd(horizon, now);
  const days = Math.max(differenceInCalendarDays(end, today), 0);

  // How much of a month's budget the window really holds. The current month is
  // already part spent, so charging a full €200 of food for the eleven days
  // left in it would answer a question nobody asked.
  let monthsCovered = 0;
  for (let offset = 0; offset <= days; offset++) monthsCovered += 1 / getDaysInMonth(addDays(today, offset));

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
      label: "salary",
      total: enabled ? round2(salary.amount * paydays.length) : 0,
      occurrences: paydays.length,
      perMonth: salary.amount,
      enabled,
    });
    if (enabled) for (const date of paydays) events.push({ kind: "income", label: "salary", amount: salary.amount, date });
  }

  // ── Bills ─────────────────────────────────────────────────────────────────

  for (const bill of bills.filter((b) => b.isActive)) {
    const occurrences = billOccurrences(bill, today, end);
    if (occurrences.length === 0) continue;

    const amount = round2(bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);
    const enabled = isOn(bill.id);

    rows.push({ id: bill.id, source: "bill", label: bill.name, total: enabled ? -round2(amount * occurrences.length) : 0, occurrences: occurrences.length, enabled });
    if (!enabled) continue;

    for (const occurrence of occurrences) {
      const overdue = occurrence.date < today;
      events.push({
        kind: "bill",
        label: bill.name,
        amount: -amount,
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
    const total = need + target * laterMonths.length;
    if (total <= 0) continue;

    const enabled = isOn(goal.id);
    rows.push({ id: goal.id, source: "goal", label: goal.name, total: enabled ? -round2(total) : 0, occurrences: (need > 0 ? 1 : 0) + (target > 0 ? laterMonths.length : 0), perMonth: target, enabled });
    if (!enabled) continue;

    if (need > 0) events.push({ kind: "goal", label: goal.name, amount: -need, date: today });
    if (target > 0) for (const month of laterMonths) events.push({ kind: "goal", label: goal.name, amount: -target, date: month });
  }

  // ── The user's own budget lines ───────────────────────────────────────────
  // Accrued by the day rather than dropped on a date: "€200 of food a month" is
  // a rate, not an appointment, and spreading it keeps the line readable and
  // the current month honestly pro-rated.

  let dailyIn = 0;
  let dailyOut = 0;

  for (const line of lines) {
    const enabled = isOn(line.id);
    const sign = line.kind === "income" ? 1 : -1;

    rows.push({ id: line.id, source: "line", label: line.label, total: enabled ? round2(line.amount * monthsCovered) * sign : 0, perMonth: line.amount * sign, enabled });
    if (!enabled) continue;

    if (line.kind === "income") dailyIn += line.amount;
    else dailyOut += line.amount;
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

  for (let offset = 0; offset <= days; offset++) {
    const date = addDays(today, offset);
    balance += (dailyIn - dailyOut) / getDaysInMonth(date);

    const dayEvents = events.filter((e) => differenceInCalendarDays(e.date, date) === 0);
    for (const event of dayEvents) balance += event.amount;

    if (balance < lowestBalance) lowestBalance = balance;
    if (balance < 0 && !breaksOn) {
      breaksOn = date;
      const outgoings = dayEvents.filter((e) => e.amount < 0);
      breakingEvent = outgoings.length > 0 ? outgoings.reduce((big, e) => (e.amount < big.amount ? e : big)) : undefined;
    }

    points.push({ date, balance: round2(balance), events: dayEvents });
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const sumOf = (match: (row: PlanRow) => boolean) => round2(rows.filter(match).reduce((sum, row) => sum + Math.abs(row.total), 0));

  const incomeTotal = sumOf((r) => r.total > 0);
  const billsTotal = sumOf((r) => r.source === "bill");
  const goalsTotal = sumOf((r) => r.source === "goal");
  const budgetTotal = sumOf((r) => r.source === "line" && r.total < 0);
  const outgoingTotal = round2(billsTotal + goalsTotal + budgetTotal);

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
    outgoingTotal,
    net,
    endingBalance,
    points,
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
