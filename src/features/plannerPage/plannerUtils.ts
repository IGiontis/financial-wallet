import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { isDiscretionarySpending, isEarning } from "../../shared/utils/moneyModel";
import { getDeadline, getGraceDays, getIntervalCount, getPeriodDueDate, getPeriodKey } from "../bills/billsUtils";
import type { BillWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The planner answers one question: will the money last?
//
// Everything here is derived from data the app already holds — transactions,
// bills and goals — so the page needs no manual bookkeeping and costs no extra
// Firestore reads. The one thing a user can add is income they *expect* but
// haven't received, which by definition can't be derived from anything.
//
// The window can be the current pay cycle or several months. Anything past the
// next payday has to project future salaries and repeat every recurring bill,
// or the answer is a fiction: a three-month view that charges the electricity
// once would clear every month it doesn't actually cover.

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

/** The payday that opened the current cycle — on or before today. */
export function lastSalaryDate(dayOfMonth: number | undefined, now: Date = new Date()): Date {
  const day = dayOfMonth ?? 1;
  const today = startOfDay(now);

  const thisMonth = clampDay(today.getFullYear(), today.getMonth(), day);
  if (thisMonth <= today) return thisMonth;
  return clampDay(today.getFullYear(), today.getMonth() - 1, day);
}

// ─── Everyday burn rate ──────────────────────────────────────────────────────

/**
 * Average spend per day on everything that isn't a bill.
 *
 * Bill payments are excluded because the projection charges upcoming bills
 * separately on their own due dates — leaving them in here would bill you twice
 * for the same electricity.
 */
export function dailyBurnRate(transactions: Transaction[], now: Date = new Date(), windowDays = 30): number {
  const from = startOfDay(addDays(now, -windowDays));
  const today = startOfDay(now);

  const total = transactions.filter(isDiscretionarySpending).reduce((sum, tx) => {
    const date = startOfDay(firestoreToDate(tx.date));
    return date >= from && date <= today ? sum + Math.abs(tx.amount) : sum;
  }, 0);

  return round2(total / windowDays);
}

// ─── Goals ───────────────────────────────────────────────────────────────────

/**
 * What a goal wants from *this* cycle's money.
 *
 * For a recurring goal this is deliberately not `remaining`: that figure
 * accumulates arrears from every month since the goal was created, so a €200
 * monthly goal left alone for five months reports €1,000 owed. Demanding all of
 * it from one paycheque would be both wrong and demoralising — the plan asks
 * for this period's target less whatever has already gone in, and back-payments
 * stay a separate conversation on the Goals screen.
 *
 * Unlike the old planner this also never hides a goal you're keeping up with: a
 * funded goal reports zero, which is the truth, rather than vanishing.
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

const plannableGoals = (goals: InvestmentGoalWithStats[], skipIds: ReadonlySet<string>) => goals.filter((g) => g.isActive && !g.isCompleted && !skipIds.has(g.id));

export function goalsStillNeeded(goals: InvestmentGoalWithStats[], skipIds: ReadonlySet<string>, now: Date = new Date()): number {
  return round2(plannableGoals(goals, skipIds).reduce((sum, g) => sum + goalMonthlyNeed(g, now), 0));
}

// ─── Horizon ─────────────────────────────────────────────────────────────────

export type PlannerHorizon = "payday" | "month" | "3m" | "6m";

export const PLANNER_HORIZONS: readonly PlannerHorizon[] = ["payday", "month", "3m", "6m"] as const;

/**
 * Last day the projection covers, inclusive.
 *
 * The pay-cycle window deliberately stops the day *before* payday: the money
 * has to stretch until the new salary lands, so crediting that salary inside
 * the same window would answer a different, much easier question. Longer
 * horizons do include future paydays — over three months they are most of the
 * story.
 */
export function horizonEnd(horizon: PlannerHorizon, salaryDay: number | undefined, now: Date = new Date()): Date {
  const today = startOfDay(now);
  if (horizon === "payday") return addDays(nextSalaryDate(salaryDay, now), -1);

  const months = horizon === "month" ? 0 : horizon === "3m" ? 2 : 5;
  return endOfMonth(addMonths(today, months));
}

// ─── Recurring events in the window ──────────────────────────────────────────

/**
 * Every time a bill falls due between `from` and `to`.
 *
 * Looking more than one cycle ahead means a monthly bill has to appear once per
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
  // A generous cap: six months of a weekly bill is ~26. The loop must not
  // depend on the data being sane.
  for (let i = 0; i < 60; i++) {
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

// ─── The projection ──────────────────────────────────────────────────────────

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

export interface ProjectionPoint {
  date: Date;
  balance: number;
  events: PlannerEvent[];
}

export type PlannerVerdict = "ok" | "tight" | "short";

export interface PlannerPlan {
  cycleStart: Date;
  nextSalary: Date;
  end: Date;
  daysRemaining: number;
  /** Received since the last payday, plus anything the user says is still coming. */
  income: number;
  /** Already gone this cycle — everyday spending and bills alike. */
  spent: number;
  /** Everything still to happen inside the window, soonest first. */
  events: PlannerEvent[];
  billsTotal: number;
  goalsReserved: number;
  burnRate: number;
  /** What is notionally in hand right now, before anything upcoming. */
  startingBalance: number;
  points: ProjectionPoint[];
  lowestBalance: number;
  breaksOn?: Date;
  /** The outgoing that tipped it under, when one thing did it. */
  breakingEvent?: PlannerEvent;
  verdict: PlannerVerdict;
  surplus: number;
  shortfall: number;
  /** What is left per day once everything committed inside the window is set aside. */
  safeDailySpend: number;
}

export interface PlanInput {
  transactions: Transaction[];
  bills: BillWithStatus[];
  goals: InvestmentGoalWithStats[];
  skipGoalIds?: ReadonlySet<string>;
  expectedExtra?: number;
  salary?: SalaryPattern;
  horizon?: PlannerHorizon;
  now?: Date;
}

/** Below this many days of everyday spending in hand, "yes" deserves a caveat. */
const TIGHT_DAYS = 3;

export function buildPlan({ transactions, bills, goals, skipGoalIds = new Set(), expectedExtra = 0, salary, horizon = "payday", now = new Date() }: PlanInput): PlannerPlan {
  const today = startOfDay(now);
  const salaryDay = salary?.dayOfMonth;
  const cycleStart = lastSalaryDate(salaryDay, now);
  const nextSalary = nextSalaryDate(salaryDay, now);
  const end = horizonEnd(horizon, salaryDay, now);
  const daysRemaining = Math.max(differenceInCalendarDays(end, today), 0);

  const inCycle = (date: Date) => date >= cycleStart && date <= today;

  const income = round2(
    transactions.filter(isEarning).reduce((sum, tx) => (inCycle(startOfDay(firestoreToDate(tx.date))) ? sum + Math.abs(tx.amount) : sum), 0) + Math.max(expectedExtra, 0),
  );

  const everydaySpent = round2(
    transactions.filter(isDiscretionarySpending).reduce((sum, tx) => (inCycle(startOfDay(firestoreToDate(tx.date))) ? sum + Math.abs(tx.amount) : sum), 0),
  );

  // Bills paid this cycle also left the account, and they are deliberately not
  // in `everydaySpent` — that excludes bill-linked transactions so the upcoming
  // ones below can be charged on their own dates without counting twice.
  const billsPaidThisCycle = round2(
    bills
      .filter((b) => b.isActive && b.isPaidThisPeriod && b.payment)
      .reduce((sum, b) => (inCycle(startOfDay(firestoreToDate(b.payment!.paidDate))) ? sum + b.payment!.amount : sum), 0),
  );

  // ── Everything still to happen inside the window ──────────────────────────

  const events: PlannerEvent[] = [];

  for (const bill of bills.filter((b) => b.isActive)) {
    const amount = round2(bill.isVariableAmount ? (bill.averagePaidAmount ?? bill.amount) : bill.amount);

    for (const occurrence of billOccurrences(bill, today, end)) {
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

  // Future paydays: without them any window past the next salary is a fiction.
  if (salary) {
    for (let cursor = nextSalary; cursor <= end; cursor = addMonths(cursor, 1)) {
      events.push({ kind: "income", label: "salary", amount: salary.amount, date: startOfDay(cursor) });
    }
  }

  const goalsReserved = goalsStillNeeded(goals, skipGoalIds, now);
  const monthlyGoalReserve = round2(plannableGoals(goals, skipGoalIds).reduce((sum, g) => sum + goalMonthlyTarget(g, now), 0));

  // This month wants whatever is still outstanding; later months want the full
  // target again, since nothing has been paid into them yet.
  if (goalsReserved > 0) events.push({ kind: "goal", label: "goals", amount: -goalsReserved, date: today });
  if (monthlyGoalReserve > 0) {
    for (let cursor = startOfMonth(addMonths(today, 1)); cursor <= end; cursor = addMonths(cursor, 1)) {
      events.push({ kind: "goal", label: "goals", amount: -monthlyGoalReserve, date: startOfDay(cursor) });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const burnRate = dailyBurnRate(transactions, now);
  const startingBalance = round2(income - everydaySpent - billsPaidThisCycle);

  // ── Walk the days ─────────────────────────────────────────────────────────

  let balance = startingBalance;
  const points: ProjectionPoint[] = [];
  let lowestBalance = Number.POSITIVE_INFINITY;
  let breaksOn: Date | undefined;
  let breakingEvent: PlannerEvent | undefined;

  for (let offset = 0; offset <= daysRemaining; offset++) {
    const date = addDays(today, offset);
    // Today's own spending is already inside `spent`, so the daily average only
    // starts biting tomorrow.
    if (offset > 0) balance = round2(balance - burnRate);

    const dayEvents = events.filter((e) => differenceInCalendarDays(e.date, date) === 0);
    for (const event of dayEvents) balance = round2(balance + event.amount);

    if (balance < lowestBalance) lowestBalance = balance;
    if (balance < 0 && !breaksOn) {
      breaksOn = date;
      const outgoings = dayEvents.filter((e) => e.amount < 0);
      breakingEvent = outgoings.length > 0 ? outgoings.reduce((big, e) => (e.amount < big.amount ? e : big)) : undefined;
    }

    points.push({ date, balance, events: dayEvents });
  }

  const billsTotal = round2(events.filter((e) => e.kind === "bill").reduce((sum, e) => sum - e.amount, 0));
  const committed = round2(events.filter((e) => e.amount < 0).reduce((sum, e) => sum - e.amount, 0));
  const incomingLater = round2(events.filter((e) => e.kind === "income").reduce((sum, e) => sum + e.amount, 0));

  const surplus = Math.max(round2(lowestBalance), 0);
  const shortfall = lowestBalance < 0 ? round2(-lowestBalance) : 0;
  const verdict: PlannerVerdict = shortfall > 0 ? "short" : burnRate > 0 && surplus < burnRate * TIGHT_DAYS ? "tight" : "ok";

  return {
    cycleStart,
    nextSalary,
    end,
    daysRemaining,
    income,
    spent: round2(everydaySpent + billsPaidThisCycle),
    events,
    billsTotal,
    goalsReserved,
    burnRate,
    startingBalance,
    points,
    lowestBalance: round2(lowestBalance),
    breaksOn,
    breakingEvent,
    verdict,
    surplus,
    shortfall,
    safeDailySpend: daysRemaining > 0 ? round2(Math.max(startingBalance + incomingLater - committed, 0) / daysRemaining) : 0,
  };
}
