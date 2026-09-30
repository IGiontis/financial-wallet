import type { InvestmentGoal, InvestmentContribution, InvestmentGoalWithStats, InvestmentGoalStatus } from "../../shared/types/IndexTypes";
import { firestoreToDate as toDate } from "../../shared/utils/dates";

/**
 * Every contribution's date read once, as numbers the loops below can compare.
 *
 * The carryover walks used to re-filter the whole list for every month since the
 * goal was created, calling `toDate` twice inside each predicate — a three-year
 * monthly goal with forty contributions built something like five thousand seven
 * hundred `Date` objects every time the stats were computed, which is on every
 * fetch and every remount. A month becomes one integer here (`year × 12 +
 * month`), so the walks read a map instead of scanning.
 */
interface DatedContribution {
  month: number;
  year: number;
  time: number;
  deposit: boolean;
  amount: number;
}

function read(contributions: InvestmentContribution[]): DatedContribution[] {
  return contributions.map((c) => {
    const date = toDate(c.date);
    return {
      month: date.getFullYear() * 12 + date.getMonth(),
      year: date.getFullYear(),
      time: date.getTime(),
      deposit: c.contributionType === "deposit",
      amount: c.amount,
    };
  });
}

/**
 * To the cent, which is the only precision money has.
 *
 * Every comparison below is made on rounded figures. Amounts are floats, and a
 * float sum of cents does not land where the cents do: 256.02 + 333.33 + 410.65
 * is 999.9999999999999, so a €1,000 goal paid to the cent was never
 * "completed", and a €100 month paid as 1.02 + 64.07 + 34.91 read "behind" with
 * €0.00 remaining — a status the screen could not even explain.
 */
const round2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** Net per period — deposits less withdrawals — keyed by the given period, to the cent. */
function netBy(dated: DatedContribution[], key: (row: DatedContribution) => number): Map<number, number> {
  const totals = new Map<number, number>();
  for (const row of dated) {
    const at = key(row);
    totals.set(at, (totals.get(at) ?? 0) + (row.deposit ? row.amount : -row.amount));
  }
  for (const [at, total] of totals) totals.set(at, round2(total));
  return totals;
}

// ─── A deadline, in monthly slices ───────────────────────────────────────────

export interface DeadlinePace {
  /** Months still to save in, this one included. Zero once the deadline's month has gone. */
  monthsLeft: number;
  /** The level monthly figure: what each month from this one to the deadline's asks for. */
  perMonth: number;
  /** What this month still wants, after what has already gone in this month. */
  thisMonth: number;
}

/**
 * How a goal with a deadline is paid for, month by month — the one rule the
 * Goals page, the Planner and the Allocation page all read.
 *
 * They used to disagree. The Goals page divided what was left by the months
 * *between* now and the deadline; the Planner and Allocation divided it by one
 * more, because the plan charges this month as well. €900 due in two months
 * was €450 a month on one screen and €300 on the other two.
 *
 * The rule, month by month rather than by day:
 *
 *   • The months counted are this one and every one up to and including the
 *     deadline's own. This month still gets a slice — a plan that never asks
 *     for anything this month is one that is always about to start — and a
 *     deadline on the 4th still has that month's pay to draw on. €900 due in
 *     November, seen in September: three slices of €300.
 *   • The slices are levelled from the start of this month, so money already
 *     put in this month counts towards this month's slice instead of shrinking
 *     it. Without that the figure fell every time a deposit landed — €200 a
 *     month became €166.67 the moment September's €200 went in, and the plan
 *     asked for a second slice the same month — then jumped back on the 1st.
 *     It is the same shape as a recurring goal: a monthly target, and what is
 *     still needed of it after this period's deposits. Money taken out this
 *     month is not demanded back in one go; it is spread like the rest.
 *   • A month that has already had more than its slice lowers the later ones
 *     rather than being charged again: they share what is actually left.
 *   • Deadline this month, or already gone: everything still owed, now. There
 *     is no later month to spread it over, and an overdue goal is not settled
 *     by being ignored.
 *
 * `thisMonth` plus `perMonth` for each later month adds up to what is left, to
 * the cent: this month's slice takes the rounding, since it is the one being
 * paid now. (After this month has been overpaid there is no slice left to take
 * it, and the later months can each be a fraction of a cent off.)
 */
export function deadlinePace(remaining: number, deadline: Date, savedThisMonth = 0, now: Date = new Date()): DeadlinePace {
  const monthsAhead = (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
  const monthsLeft = Math.max(monthsAhead + 1, 0);
  const owed = Math.max(round2(remaining), 0);
  if (owed === 0) return { monthsLeft, perMonth: 0, thisMonth: 0 };

  // Due this month, or overdue: this month is the only one there is, so its
  // figure is simply what is still owed.
  if (monthsLeft <= 1) return { monthsLeft, perMonth: owed, thisMonth: owed };

  const already = Math.max(round2(savedThisMonth), 0);
  const level = (owed + already) / monthsLeft;

  // This month has already had its slice, and more: nothing more is asked of
  // it, and the months after it share what is left.
  if (already >= level) return { monthsLeft, perMonth: round2(owed / (monthsLeft - 1)), thisMonth: 0 };

  // Rounded to the nearest cent, unless rounding up would promise the later
  // months more than is left — €0.05 over seven months is not six slices of a
  // cent — in which case they take the cent below and this month the rest.
  const nearest = round2(level);
  const perMonth = nearest * (monthsLeft - 1) > owed ? Math.floor((owed / (monthsLeft - 1)) * 100) / 100 : nearest;
  const thisMonth = Math.min(Math.max(round2(owed - perMonth * (monthsLeft - 1)), 0), owed);
  return { monthsLeft, perMonth, thisMonth };
}

export function computeGoalStats(goal: InvestmentGoal, contributions: InvestmentContribution[]): InvestmentGoalWithStats {
  const dated = read(contributions);

  // ── Totals ────────────────────────────────────────────────────────────────
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let contributionCount = 0;
  let withdrawalCount = 0;
  // The newest, found by walking once. Sorting the whole list to read element
  // zero is the same answer for more work, and the sort parsed every date twice
  // per comparison.
  let newest: number | undefined;

  for (const row of dated) {
    if (row.deposit) {
      totalDeposited += row.amount;
      contributionCount++;
    } else {
      totalWithdrawn += row.amount;
      withdrawalCount++;
    }
    if (newest === undefined || row.time > newest) newest = row.time;
  }

  totalDeposited = round2(totalDeposited);
  totalWithdrawn = round2(totalWithdrawn);
  const totalSaved = round2(totalDeposited - totalWithdrawn);
  const lastContributionDate = newest === undefined ? undefined : new Date(newest);

  // ── Open-ended goals ──────────────────────────────────────────────────────
  if (goal.goalType === "open_ended") {
    return { ...goal, totalDeposited, totalWithdrawn, totalSaved, contributionCount, withdrawalCount, lastContributionDate };
  }

  const targetAmount = goal.targetAmount ?? 0;

  // ── Recurring monthly goal ────────────────────────────────────────────────
  if (goal.targetPeriod === "monthly") {
    const now = new Date();
    const netByMonth = netBy(dated, (row) => row.month);
    const currentMonth = now.getFullYear() * 12 + now.getMonth();

    // Raw net — can be negative when withdrawals exceed deposits this period.
    const currentPeriodNet = netByMonth.get(currentMonth) ?? 0;
    // Clamped only for display (stat cell, bar fill).
    const currentPeriodSaved = Math.max(currentPeriodNet, 0);

    // ── Carryover: walk every past month ─────────────────────────────────
    const goalCreated = toDate(goal.createdAt);
    const startMonth = goalCreated.getFullYear() * 12 + goalCreated.getMonth();

    // positive = credit (overpaid), negative = debt (underpaid)
    let accumulatedBalance = 0;
    let missedMonths = 0;

    // Every step rounded to the cent (see `round2`): a month paid to the cent is
    // not a missed month, and a balance that is level is not a hair behind.
    for (let month = startMonth; month < currentMonth; month++) {
      const diff = round2((netByMonth.get(month) ?? 0) - targetAmount);
      accumulatedBalance = round2(accumulatedBalance + diff);
      if (diff < 0) missedMonths++;
    }

    const arrears = accumulatedBalance < 0 ? Math.abs(accumulatedBalance) : 0;
    const credit = accumulatedBalance > 0 ? accumulatedBalance : 0;

    // totalDue: used only for bar display (how much is nominally owed this period
    // after credit/arrears are applied). NOT used for status.
    const totalDue = round2(Math.max(targetAmount - credit, 0) + arrears);

    // ── Unified balance ───────────────────────────────────────────────────
    // Combines all past carryover + this period's net + this period's target.
    // Positive = ahead of schedule, zero = exactly on track, negative = behind.
    //
    // Example: credit=200, net=0, target=200 → totalBalance=0 → "on_track"
    //   (credit consumed by this month's target; not ahead, just current)
    // Example: credit=400, net=0, target=200 → totalBalance=200 → "ahead"
    //   (one month of credit remains after covering this month)
    const totalBalance = round2(accumulatedBalance + currentPeriodNet - targetAmount);

    const remaining = totalBalance < 0 ? Math.abs(totalBalance) : 0;
    const periodSurplus = totalBalance > 0 ? totalBalance : 0;

    let status: InvestmentGoalStatus;
    if (totalBalance > 0) status = "ahead";
    else if (totalBalance === 0) status = "on_track";
    else status = "behind";

    return {
      ...goal,
      totalDeposited,
      totalWithdrawn,
      totalSaved,
      // Clamped at both ends. A month with more taken out than put in gives a
      // negative share, and two of the three progress bars hand it straight to a
      // width: -78% read as an empty bar on one screen and a full one on another.
      percentageReached: totalDue > 0 ? Math.min(Math.max((currentPeriodNet / totalDue) * 100, 0), 100) : status !== "behind" ? 100 : 0,
      remaining,
      monthlyRequired: targetAmount,
      currentPeriodSaved,
      arrears,
      missedMonths,
      periodSurplus,
      periodCredit: credit,
      status,
      contributionCount,
      withdrawalCount,
      lastContributionDate,
    };
  }

  // ── Recurring yearly goal ─────────────────────────────────────────────────
  if (goal.targetPeriod === "yearly") {
    const now = new Date();
    const currentYear = now.getFullYear();

    const netByYear = netBy(dated, (row) => row.year);
    const currentPeriodNet = netByYear.get(currentYear) ?? 0;
    const currentPeriodSaved = Math.max(currentPeriodNet, 0);

    // ── Carryover: walk every past year ──────────────────────────────────
    const goalStartYear = toDate(goal.createdAt).getFullYear();
    let accumulatedBalance = 0;
    let missedMonths = 0;

    for (let y = goalStartYear; y < currentYear; y++) {
      const diff = round2((netByYear.get(y) ?? 0) - targetAmount);
      accumulatedBalance = round2(accumulatedBalance + diff);
      if (diff < 0) missedMonths++;
    }

    const arrears = accumulatedBalance < 0 ? Math.abs(accumulatedBalance) : 0;
    const credit = accumulatedBalance > 0 ? accumulatedBalance : 0;
    const totalDue = round2(Math.max(targetAmount - credit, 0) + arrears);

    // To the cent, as in the monthly walk above.
    const totalBalance = round2(accumulatedBalance + currentPeriodNet - targetAmount);
    const remaining = totalBalance < 0 ? Math.abs(totalBalance) : 0;
    const periodSurplus = totalBalance > 0 ? totalBalance : 0;

    let status: InvestmentGoalStatus;
    if (totalBalance > 0) status = "ahead";
    else if (totalBalance === 0) status = "on_track";
    else status = "behind";

    return {
      ...goal,
      totalDeposited,
      totalWithdrawn,
      totalSaved,
      // Clamped at both ends. A month with more taken out than put in gives a
      // negative share, and two of the three progress bars hand it straight to a
      // width: -78% read as an empty bar on one screen and a full one on another.
      percentageReached: totalDue > 0 ? Math.min(Math.max((currentPeriodNet / totalDue) * 100, 0), 100) : status !== "behind" ? 100 : 0,
      remaining,
      yearlyRequired: targetAmount,
      currentPeriodSaved,
      arrears,
      missedMonths,
      periodSurplus,
      periodCredit: credit,
      status,
      contributionCount,
      withdrawalCount,
      lastContributionDate,
    };
  }

  // ── One-time targeted goal ────────────────────────────────────────────────
  // Same clamp: a goal can be drawn down below what went into it.
  const percentageReached = targetAmount > 0 ? Math.min(Math.max((totalSaved / targetAmount) * 100, 0), 100) : 0;
  const remaining = round2(Math.max(targetAmount - totalSaved, 0));

  const now = new Date();
  // What has gone in this month, net and never below nothing. The monthly
  // slice is levelled from the start of the month — see `deadlinePace` — so
  // the Planner needs this to know how much of this month's slice is still to
  // come. Display-only screens read it for recurring goals alone.
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const currentPeriodSaved = Math.max(netBy(dated, (row) => row.month).get(currentMonth) ?? 0, 0);

  let monthsLeft: number | undefined;
  let monthlyRequired: number | undefined;
  let yearlyRequired: number | undefined;

  if (goal.deadline) {
    // The same slices the Planner charges and the Allocation page sets aside.
    // A deadline this month or already gone asks for everything left, now,
    // rather than for nothing.
    const pace = deadlinePace(remaining, toDate(goal.deadline), currentPeriodSaved, now);
    monthsLeft = pace.monthsLeft;
    monthlyRequired = pace.perMonth;
    yearlyRequired = round2(monthlyRequired * 12);
  }

  let status: InvestmentGoalStatus | undefined;

  // Compared to the cent: 256.02 + 333.33 + 410.65 is a completed €1,000 goal,
  // whatever the float sum says.
  if (totalSaved >= round2(targetAmount)) {
    status = "completed";
  } else if (monthlyRequired !== undefined) {
    const createdAt = toDate(goal.createdAt);
    const monthsSinceStart = Math.max(Math.ceil((now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth())), 1);
    const avgMonthly = round2(totalSaved / monthsSinceStart);
    if (avgMonthly > monthlyRequired) status = "ahead";
    else if (avgMonthly === monthlyRequired) status = "on_track";
    else status = "behind";
  }

  return {
    ...goal,
    totalDeposited,
    totalWithdrawn,
    totalSaved,
    percentageReached,
    remaining,
    monthsLeft,
    monthlyRequired,
    yearlyRequired,
    currentPeriodSaved,
    status,
    contributionCount,
    withdrawalCount,
    lastContributionDate,
  };
}
