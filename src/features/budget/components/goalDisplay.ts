// Presentation helpers shared by InvestmentsPage and GoalsPage. Kept out of the
// component file so React Fast Refresh keeps working during development.

import type { InvestmentGoalWithStats, InvestmentGoalStatus } from "../../../shared/types/IndexTypes";
import { differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";
import { firestoreToDate, firestoreToDateOrUndefined } from "../../../shared/utils/dates";
import i18n from "../../../i18n";

export const toDate = firestoreToDateOrUndefined;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Not components, so these read the app language straight off the shared i18n
// instance rather than the useTranslation() hook — dates here were hardcoded to
// en-US before, which is why they stayed English whatever the app was set to.
//
// Built once per language and kept. An `Intl` constructor is among the most
// expensive things that can go in a list render, and these are called once per
// row: twenty goals meant forty formatters a render. `useCurrencyConverter`
// learned the same lesson — see the note on its `formatter` memo.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function dateFormatter(): Intl.DateTimeFormat {
  const locale = i18n.resolvedLanguage ?? "en";
  const found = dateFormatters.get(locale);
  if (found) return found;

  const made = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
  dateFormatters.set(locale, made);
  return made;
}

function relativeFormatter(): Intl.RelativeTimeFormat {
  const locale = i18n.resolvedLanguage ?? "en";
  const found = relativeFormatters.get(locale);
  if (found) return found;

  const made = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  relativeFormatters.set(locale, made);
  return made;
}

export const formatDate = (date?: Date) => (date ? dateFormatter().format(date) : "—");

/**
 * "in 3 months", "12 days ago" — the same date said the way it is thought about.
 *
 * A deadline of 15 Dec 2026 is a fact the reader has to do arithmetic on. Both
 * are shown, because the date is what they wrote down and the distance is what
 * they wanted to know. Days up to a month, then months, then years: nobody says
 * "in 340 days".
 */
export function relativeToNow(date: Date, now: Date = new Date()): string {
  const fmt = relativeFormatter();

  const days = differenceInCalendarDays(date, now);
  if (Math.abs(days) < 31) return fmt.format(days, "day");

  const months = differenceInCalendarMonths(date, now);
  if (Math.abs(months) < 12) return fmt.format(months, "month");

  // Rounded, not truncated: twenty months is nearer two years than one, and
  // "next year" for a date in the year after next is simply wrong.
  return fmt.format(Math.round(months / 12), "year");
}

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


export interface GoalHeadline {
  /** What has gone in — this period for a recurring goal, in total otherwise. */
  saved: number;
  /** What it is measured against. Zero when the goal has no target at all. */
  target: number;
  /** The share of it, 0 to 100. */
  pct: number;
}

/**
 * The pair of figures a goal is read by, whichever view is drawing it.
 *
 * A recurring goal is measured against this period and not against its life:
 * €4,800 put away over a year, against a €400 month, is not twelve hundred per
 * cent of anything. Credit carried in from an overpayment lowers what is due,
 * arrears raise it — the same obligation the card's bar is drawn from.
 */
export function goalHeadline(goal: InvestmentGoalWithStats): GoalHeadline {
  const target = goal.targetAmount ?? 0;
  const recurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";

  if (!recurring) {
    return { saved: goal.totalSaved ?? 0, target, pct: Math.min(Math.max(goal.percentageReached ?? 0, 0), 100) };
  }

  const saved = goal.currentPeriodSaved ?? 0;
  const due = Math.max(target - (goal.periodCredit ?? 0), 0) + (goal.arrears ?? 0);
  return { saved, target: due, pct: due > 0 ? Math.min((saved / due) * 100, 100) : goal.status !== "behind" ? 100 : 0 };
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
