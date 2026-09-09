// Presentation helpers shared by InvestmentsPage and GoalsPage. Kept out of the
// component file so React Fast Refresh keeps working during development.

import type { InvestmentGoalWithStats, InvestmentGoalStatus } from "../../../shared/types/IndexTypes";
import { differenceInCalendarDays } from "date-fns";
import { firestoreToDate, firestoreToDateOrUndefined } from "../../../shared/utils/dates";
import i18n from "../../../i18n";

export const toDate = firestoreToDateOrUndefined;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Not a component, so it reads the app language straight off the shared i18n
// instance rather than the useTranslation() hook — was hardcoded to en-US
// before, which is why dates here stayed English regardless of app language.
export const formatDate = (date?: Date) => (date ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—");

// Colours are static, labels are not — resolving the label lazily means a
// language switch is picked up instead of being frozen at module-load time.
const STATUS_COLOR: Record<InvestmentGoalStatus, string> = {
  on_track: "success",
  behind: "danger",
  ahead: "info",
  completed: "secondary",
};

const STATUS_LABEL_KEY: Record<InvestmentGoalStatus, string> = {
  on_track: "goals.onTrack",
  behind: "goals.behind",
  ahead: "goals.ahead",
  completed: "common.completed",
};

export function getStatusConfig(status: InvestmentGoalStatus): { label: string; color: string } {
  return { label: i18n.t(STATUS_LABEL_KEY[status]), color: STATUS_COLOR[status] };
}

export function getGoalTypeLabel(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly") return i18n.t("investments.recurringMonthly");
  if (goal.targetPeriod === "yearly") return i18n.t("investments.recurringYearly");
  if (goal.goalType === "targeted") return i18n.t("categories.goal");
  return i18n.t("investments.tracking");
}


// ─── Pace, and where it lands ────────────────────────────────────────────────
// A goal card can say what has been saved and what the target is, and still not
// answer the only question worth asking: am I going to make it? That takes the
// rate money has actually been going in at, and where that rate arrives.

/** Weeks in an average month — the same 30.44-day month the allocation page uses. */
export const WEEKS_PER_MONTH = 30.44 / 7;

/**
 * Months the goal has been running, counted the way the status is.
 *
 * Never less than one: a goal created this month has had one month to save in,
 * and dividing by zero would make every new goal's pace infinite.
 */
export function monthsRunning(goal: Pick<InvestmentGoalWithStats, "createdAt">, now: Date = new Date()): number {
  const created = firestoreToDate(goal.createdAt);
  return Math.max((now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth()), 1);
}

/**
 * What has actually gone in per month, on average.
 *
 * Net of withdrawals, because that is what is in the pot. Undefined when
 * nothing has been saved at all — a pace of zero is a fact, but it is not a
 * rate, and the card has something different to say about it.
 */
export function savingPace(goal: Pick<InvestmentGoalWithStats, "createdAt" | "totalSaved">, now: Date = new Date()): number | undefined {
  const saved = goal.totalSaved ?? 0;
  if (saved <= 0) return undefined;
  return round2(saved / monthsRunning(goal, now));
}

export interface Projection {
  /** The month the goal is reached at the current pace. */
  date: Date;
  /** Months past the deadline; absent when there is no deadline or it lands in time. */
  monthsLate?: number;
  /** Months to spare against the deadline. */
  monthsEarly?: number;
}

/**
 * When the goal lands at the rate it is actually being saved at.
 *
 * The deadline says when it is wanted; this says when it arrives — and the gap
 * between the two is the thing to act on. Undefined when there is nothing to
 * project: no target, nothing left to save, or nothing saved yet to set a pace.
 */
export function projectedFinish(goal: InvestmentGoalWithStats, now: Date = new Date()): Projection | undefined {
  if (goal.goalType === "open_ended" || goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly") return undefined;

  const remaining = goal.remaining ?? 0;
  if (remaining <= 0) return undefined;

  const pace = savingPace(goal, now);
  if (!pace || pace <= 0) return undefined;

  const monthsNeeded = Math.ceil(remaining / pace);
  const date = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1);

  const deadline = toDate(goal.deadline);
  if (!deadline) return { date };

  const gap = (date.getFullYear() - deadline.getFullYear()) * 12 + (date.getMonth() - deadline.getMonth());
  if (gap > 0) return { date, monthsLate: gap };
  if (gap < 0) return { date, monthsEarly: -gap };
  return { date };
}

/** The monthly figure as a weekly one — a target you can act on this Saturday. */
export const perWeek = (monthly: number): number => round2(monthly / WEEKS_PER_MONTH);

/** Whole days since the last money went in. Undefined when none ever has. */
export function daysSinceContribution(goal: Pick<InvestmentGoalWithStats, "lastContributionDate">, now: Date = new Date()): number | undefined {
  const last = toDate(goal.lastContributionDate);
  return last ? Math.max(differenceInCalendarDays(now, last), 0) : undefined;
}
