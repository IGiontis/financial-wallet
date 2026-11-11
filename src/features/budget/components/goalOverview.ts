import { addMonths, startOfMonth, subMonths } from "date-fns";
import { goalHeadline, toDate } from "./goalDisplay";
import type { InvestmentContribution, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// The figures of the «Επισκόπηση» tab on both goal screens, worked out here
// rather than in the page so they can be checked a second way in a test.
//
// Nothing here reads anything: the goals arrive with their stats, and the
// contributions are the list `useInvestmentGoals` already holds for them.

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Which goals each screen shows ──────────────────────────────────────────

export const isRecurringGoal = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";
export const isTrackingGoal = (g: InvestmentGoalWithStats) => g.goalType === "open_ended";

/** Running on the Investments screen: a recurring one never completes, so only its pause counts. */
export const investmentRunning = (g: InvestmentGoalWithStats) => (isRecurringGoal(g) ? g.isActive : g.isActive && !g.isCompleted);

// ─── A status filter — the «Όλοι ▾» menu ────────────────────────────────────

export interface GoalStatusOption {
  id: string;
  /** Already in the reader's language. */
  label: string;
  test: (goal: InvestmentGoalWithStats) => boolean;
}

/** How many of `goals` each option keeps — the figures the menu shows beside each choice. */
export function countByStatus(goals: InvestmentGoalWithStats[], options: GoalStatusOption[]): Record<string, number> {
  return Object.fromEntries(options.map((option) => [option.id, goals.filter(option.test).length]));
}

/**
 * When a goal was made, for the order the cards stand in. One saved a moment ago
 * and not yet back from the server has no date yet, and it is the newest of all.
 */
const createdTime = (g: InvestmentGoalWithStats) => toDate(g.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;

/**
 * The goals a tab shows: those its status keeps, whose name or note holds the
 * search — the newest made first, and the paused ones gathered at the end, so
 * under «Όλα» the running goals are what the eye meets.
 */
export function filterGoals(goals: InvestmentGoalWithStats[], option: GoalStatusOption | undefined, search: string): InvestmentGoalWithStats[] {
  const query = search.trim().toLowerCase();
  return goals
    .filter((g) => {
      if (option && !option.test(g)) return false;
      if (!query) return true;
      return g.name.toLowerCase().includes(query) || (g.notes?.toLowerCase().includes(query) ?? false);
    })
    .sort((a, b) => Number(!a.isActive) - Number(!b.isActive) || createdTime(b) - createdTime(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ─── The savings goals' tiles ───────────────────────────────────────────────

export interface GoalsSummary {
  /** Put into the running goals so far. */
  saved: number;
  /** Still to put into them. */
  remaining: number;
  active: number;
  onTrack: number;
  /** What a month asks to land every running goal on its date. */
  monthly: number;
  paused: number;
  completed: number;
}

/**
 * The running goals' money — what is in them, what they still want, what a
 * month asks. A running goal is under its target (reaching it completes it), so
 * `saved + remaining` is what they add up to.
 */
export function goalsSummary(goals: InvestmentGoalWithStats[]): GoalsSummary {
  const active = goals.filter((g) => g.isActive && !g.isCompleted);
  return {
    saved: round2(active.reduce((sum, g) => sum + g.totalSaved, 0)),
    remaining: round2(active.reduce((sum, g) => sum + (g.remaining ?? 0), 0)),
    active: active.length,
    onTrack: active.filter((g) => g.status === "on_track" || g.status === "ahead").length,
    monthly: round2(active.reduce((sum, g) => sum + (g.monthlyRequired ?? 0), 0)),
    paused: goals.filter((g) => !g.isActive && !g.isCompleted).length,
    completed: goals.filter((g) => g.isCompleted).length,
  };
}

// ─── The investments' tiles ─────────────────────────────────────────────────

export interface PeriodTotals {
  /** Running goals of this period. */
  count: number;
  /** What the period asks of them, after carry-over credit and with arrears. */
  due: number;
  /** Of `due`, what is in. */
  paid: number;
}

export interface InvestmentsSummary {
  /** Everything ever kept in them, running or not. */
  totalSaved: number;
  monthly: PeriodTotals;
  yearly: PeriodTotals;
  /** Running recurring ones. */
  recurring: number;
  /** Surplus of those ahead less what those behind still owe: above zero ahead, below it behind. */
  net: number;
  behindCount: number;
}

function periodTotals(goals: InvestmentGoalWithStats[]): PeriodTotals {
  const due = round2(goals.reduce((sum, g) => sum + Math.max((g.targetAmount ?? 0) - (g.periodCredit ?? 0), 0) + (g.arrears ?? 0), 0));
  const remaining = round2(goals.reduce((sum, g) => sum + (g.remaining ?? 0), 0));
  return { count: goals.length, due, paid: round2(Math.max(due - remaining, 0)) };
}

/** The same figures the screen's boxes always showed, now in one place. */
export function investmentsSummary(goals: InvestmentGoalWithStats[]): InvestmentsSummary {
  const running = goals.filter(investmentRunning);
  const recurring = running.filter(isRecurringGoal);
  const behind = recurring.filter((g) => g.status === "behind");
  const aheadBy = recurring.filter((g) => g.status === "ahead").reduce((sum, g) => sum + (g.periodSurplus ?? 0), 0);
  const behindBy = behind.reduce((sum, g) => sum + (g.remaining ?? 0), 0);
  return {
    totalSaved: round2(goals.reduce((sum, g) => sum + g.totalSaved, 0)),
    monthly: periodTotals(running.filter((g) => g.targetPeriod === "monthly")),
    yearly: periodTotals(running.filter((g) => g.targetPeriod === "yearly")),
    recurring: recurring.length,
    net: round2(aheadBy - behindBy),
    behindCount: behind.length,
  };
}

// ─── «Κοντά στο τέλος» ──────────────────────────────────────────────────────

export interface NearItem {
  goal: InvestmentGoalWithStats;
  saved: number;
  target: number;
  pct: number;
}

/**
 * The running goals with a figure to reach, furthest along first — the same
 * saved / target / % as the card's ring and the list's bar (`goalHeadline`).
 * A recurring one is measured against this period.
 */
export function nearestToDone(goals: InvestmentGoalWithStats[], running: (g: InvestmentGoalWithStats) => boolean, limit = 4): NearItem[] {
  return goals
    .filter(running)
    .map((goal) => ({ goal, ...goalHeadline(goal) }))
    .filter((item) => item.target > 0)
    .sort((a, b) => b.pct - a.pct || a.goal.name.localeCompare(b.goal.name))
    .slice(0, limit);
}

// ─── «Στο χρόνο» ────────────────────────────────────────────────────────────

export interface MonthMoves {
  /** First day of the month. */
  start: Date;
  /** Put in during it — the friend's payment for you included, as the goal counts it. */
  deposits: number;
  /** Taken out during it. */
  withdrawals: number;
}

/**
 * The last `months` calendar months, this one last, with what went into and
 * out of the given goals in each. A move outside the window, or into a goal
 * that is not one of these, is not counted.
 */
export function monthlyMoves(contributions: InvestmentContribution[], goalIds: ReadonlySet<string>, now: Date = new Date(), months = 12): MonthMoves[] {
  const first = startOfMonth(subMonths(now, months - 1));
  const series: MonthMoves[] = Array.from({ length: months }, (_, i) => ({ start: addMonths(first, i), deposits: 0, withdrawals: 0 }));
  const end = addMonths(first, months).getTime();
  for (const c of contributions) {
    if (!goalIds.has(c.goalId)) continue;
    const date = toDate(c.date);
    if (!date) continue;
    const time = date.getTime();
    if (time < first.getTime() || time >= end) continue;
    const index = (date.getFullYear() - first.getFullYear()) * 12 + (date.getMonth() - first.getMonth());
    const month = series[index];
    if (!month) continue;
    if (c.contributionType === "withdrawal") month.withdrawals = round2(month.withdrawals + c.amount);
    else month.deposits = round2(month.deposits + c.amount);
  }
  return series;
}
