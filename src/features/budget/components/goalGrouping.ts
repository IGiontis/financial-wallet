import { differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";
import { getStatusConfig, goalHeadline, toDate } from "./goalDisplay";
import i18n from "../../../i18n";
import type { InvestmentGoalStatus, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// Goals in stacks rather than a grid.
//
// A grid of cards answers "what am I saving for" and refuses to answer "what
// needs attention". Six equal rectangles give the holiday in eleven months
// exactly as much of the eye as the one that is three weeks overdue. Stacking
// them puts an order on the page, and which order is the reader's to choose —
// by when it is due, by how far along it is, by what kind of thing it is.

/** The dimensions a list can be stacked by. */
export type GoalGroupBy = "deadline" | "progress" | "status" | "category" | "kind";

export const GROUP_BY_OPTIONS: { value: GoalGroupBy; labelKey: string; icon: string }[] = [
  { value: "deadline", labelKey: "goals.groupDeadline", icon: "calendar" },
  { value: "progress", labelKey: "goals.groupProgress", icon: "percent" },
  { value: "status", labelKey: "goals.groupStatus", icon: "flag" },
  { value: "category", labelKey: "goals.groupCategory", icon: "tag" },
  { value: "kind", labelKey: "goals.groupKind", icon: "layers" },
];

export interface GoalGroup {
  /** Stable within a dimension, and the key a collapsed stack is remembered by. */
  id: string;
  /** Already in the reader's language — these are resolved where they are made. */
  label: string;
  /** Shown instead of a word when the dimension is the goal's own icon. */
  icon?: string;
  /** The stack that wants reading first, drawn in the warning colour. */
  urgent?: boolean;
  goals: InvestmentGoalWithStats[];
  /** Still to save across the whole stack. */
  remaining: number;
  /** What it takes each month to land every one of them on time. */
  monthlyNeeded: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Deadline ────────────────────────────────────────────────────────────────

export type DeadlineGroup = "overdue" | "thisMonth" | "next3" | "thisYear" | "later" | "noDeadline" | "done";

const DEADLINE_ORDER: DeadlineGroup[] = ["overdue", "thisMonth", "next3", "thisYear", "later", "noDeadline", "done"];

const DEADLINE_LABEL_KEY: Record<DeadlineGroup, string> = {
  overdue: "goals.stackOverdue",
  thisMonth: "goals.stackThisMonth",
  next3: "goals.stackNext3",
  thisYear: "goals.stackThisYear",
  later: "goals.stackLater",
  noDeadline: "goals.stackNoDeadline",
  done: "goals.stackDone",
};

/**
 * Which horizon a goal's deadline falls in.
 *
 * Counted in calendar months, not in days: "next month" is a month a person can
 * name, and a deadline on the 2nd is not further away than one on the 28th of
 * the month before just because thirty days say so. Overdue is the one
 * exception, because a day past is past.
 */
export function deadlineBucket(goal: InvestmentGoalWithStats, now: Date = new Date()): DeadlineGroup {
  if (goal.isCompleted) return "done";

  const deadline = toDate(goal.deadline);
  if (!deadline) return "noDeadline";

  if (differenceInCalendarDays(deadline, now) < 0) return "overdue";

  const months = differenceInCalendarMonths(deadline, now);
  if (months === 0) return "thisMonth";
  if (months <= 3) return "next3";
  if (deadline.getFullYear() === now.getFullYear()) return "thisYear";
  return "later";
}

// ─── Kind ────────────────────────────────────────────────────────────────────

export type KindGroup = "monthly" | "yearly" | "tracking" | "done";

const KIND_ORDER: KindGroup[] = ["monthly", "yearly", "tracking", "done"];

const KIND_LABEL_KEY: Record<KindGroup, string> = {
  monthly: "investments.recurringMonthly",
  yearly: "investments.recurringYearly",
  tracking: "investments.tracking",
  done: "goals.stackDone",
};

/** What kind of thing a goal is, for the screen whose goals have no deadlines. */
export function kindBucket(goal: InvestmentGoalWithStats): KindGroup {
  if (goal.targetPeriod === "monthly") return "monthly";
  if (goal.targetPeriod === "yearly") return "yearly";
  // A recurring goal is never finished, so only the others can land here.
  if (goal.isCompleted && goal.goalType !== "open_ended") return "done";
  return "tracking";
}

// ─── Status ──────────────────────────────────────────────────────────────────

const STATUS_ORDER: string[] = ["behind", "on_track", "ahead", "completed", "none"];

// ─── Progress ────────────────────────────────────────────────────────────────

/**
 * The bands a percentage falls in, least done first.
 *
 * Read down the page it becomes a worklist: everything untouched at the top,
 * everything all but finished at the bottom. The labels are numbers, so they
 * need no translating and cannot be misread in either language.
 */
const PROGRESS_BANDS: { id: string; label: string; from: number; to: number }[] = [
  { id: "p000", label: "0%", from: 0, to: 0 },
  { id: "p001", label: "1–24%", from: 1, to: 24 },
  { id: "p025", label: "25–49%", from: 25, to: 49 },
  { id: "p050", label: "50–74%", from: 50, to: 74 },
  { id: "p075", label: "75–99%", from: 75, to: 99 },
  { id: "p100", label: "100%", from: 100, to: Number.POSITIVE_INFINITY },
];

export function progressBand(goal: InvestmentGoalWithStats): (typeof PROGRESS_BANDS)[number] {
  // Floored, so 99.6% is not rounded up into a band it has not reached.
  const pct = Math.floor(goalHeadline(goal).pct);
  return PROGRESS_BANDS.find((band) => pct >= band.from && pct <= band.to) ?? PROGRESS_BANDS[0];
}

// ─── Sorting and totals ──────────────────────────────────────────────────────

/**
 * Soonest first, and within a day the one with most left to find.
 *
 * Two goals due the same week are not equally pressing: €40 short and €4,000
 * short are different problems, and the bigger one wants the higher line.
 */
function sortRows(goals: InvestmentGoalWithStats[]): InvestmentGoalWithStats[] {
  return [...goals].sort((a, b) => {
    const da = toDate(a.deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
    const db = toDate(b.deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
    return da - db || (b.remaining ?? 0) - (a.remaining ?? 0) || a.name.localeCompare(b.name);
  });
}

interface Bucketed {
  id: string;
  label: string;
  icon?: string;
  urgent?: boolean;
  goals: InvestmentGoalWithStats[];
}

function totalled(stack: Bucketed): GoalGroup {
  const goals = sortRows(stack.goals);
  return {
    ...stack,
    goals,
    remaining: round2(goals.reduce((sum, goal) => sum + (goal.remaining ?? 0), 0)),
    monthlyNeeded: round2(goals.reduce((sum, goal) => sum + (goal.monthlyRequired ?? 0), 0)),
  };
}

/** Collects into named stacks, keeping a fixed order and dropping the empty ones. */
function fixed<K extends string>(
  goals: InvestmentGoalWithStats[],
  order: K[],
  bucket: (goal: InvestmentGoalWithStats) => K,
  describe: (key: K) => Omit<Bucketed, "goals">,
): GoalGroup[] {
  const stacks = new Map<K, InvestmentGoalWithStats[]>();
  for (const goal of goals) {
    const key = bucket(goal);
    const rows = stacks.get(key);
    if (rows) rows.push(goal);
    else stacks.set(key, [goal]);
  }

  // A heading with nothing under it is a row of furniture asking to be read.
  return order.filter((key) => stacks.has(key)).map((key) => totalled({ ...describe(key), goals: stacks.get(key) ?? [] }));
}

/** Collects into stacks the data names for itself, biggest first. */
function discovered(goals: InvestmentGoalWithStats[], describe: (goal: InvestmentGoalWithStats) => Omit<Bucketed, "goals">): GoalGroup[] {
  const stacks = new Map<string, Bucketed>();
  for (const goal of goals) {
    const head = describe(goal);
    const found = stacks.get(head.id);
    if (found) found.goals.push(goal);
    else stacks.set(head.id, { ...head, goals: [goal] });
  }

  return Array.from(stacks.values())
    .map(totalled)
    .sort((a, b) => b.goals.length - a.goals.length || a.label.localeCompare(b.label));
}

// ─── The one entry point ─────────────────────────────────────────────────────

/**
 * The goals, stacked the way the reader asked for.
 *
 * Labels are resolved here rather than in the component, because two of these
 * dimensions name themselves from the data — a goal's own icon is a category
 * nobody typed and no translation file knows about.
 */
export function groupGoals(goals: InvestmentGoalWithStats[], by: GoalGroupBy, now: Date = new Date()): GoalGroup[] {
  if (by === "deadline") {
    return fixed<DeadlineGroup>(goals, DEADLINE_ORDER, (goal) => deadlineBucket(goal, now), (key) => ({
      id: key,
      label: i18n.t(DEADLINE_LABEL_KEY[key]),
      urgent: key === "overdue",
    }));
  }

  if (by === "kind") {
    return fixed<KindGroup>(goals, KIND_ORDER, kindBucket, (key) => ({ id: key, label: i18n.t(KIND_LABEL_KEY[key]) }));
  }

  if (by === "progress") {
    return fixed<string>(goals, PROGRESS_BANDS.map((band) => band.id), (goal) => progressBand(goal).id, (key) => {
      const band = PROGRESS_BANDS.find((candidate) => candidate.id === key) ?? PROGRESS_BANDS[0];
      return { id: band.id, label: band.label, urgent: band.id === "p000" };
    });
  }

  if (by === "status") {
    // Fixed order, worst first. Sorted by size instead it would put whichever
    // state happens to be commonest at the top, which on a good week is the one
    // needing nothing done about it.
    return fixed<string>(goals, STATUS_ORDER, (goal) => goal.status ?? "none", (key) => {
      if (key === "none") return { id: key, label: i18n.t("goals.stackNoStatus") };
      const { label } = getStatusConfig(key as InvestmentGoalStatus);
      return { id: key, label, urgent: key === "behind" };
    });
  }

  // Category: the goal's own icon, which is the only thing on a goal that groups
  // one with another — nobody typed a category, so nothing else can. The icon is
  // the heading; printing a word beside it would be the same word every time.
  return discovered(goals, (goal) => (goal.icon ? { id: goal.icon, label: goal.icon, icon: goal.icon } : { id: "none", label: i18n.t("goals.stackNoIcon") }));
}

/** Targeted goals, stacked under the horizon their deadline falls in. */
export const stackByDeadline = (goals: InvestmentGoalWithStats[], now: Date = new Date()) => groupGoals(goals, "deadline", now);

/** Recurring and open-ended goals, stacked by what they are. */
export const stackByKind = (goals: InvestmentGoalWithStats[]) => groupGoals(goals, "kind");
