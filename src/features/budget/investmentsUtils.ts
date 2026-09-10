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

/** Net per period — deposits less withdrawals — keyed by the given period. */
function netBy(dated: DatedContribution[], key: (row: DatedContribution) => number): Map<number, number> {
  const totals = new Map<number, number>();
  for (const row of dated) {
    const at = key(row);
    totals.set(at, (totals.get(at) ?? 0) + (row.deposit ? row.amount : -row.amount));
  }
  return totals;
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

  const totalSaved = totalDeposited - totalWithdrawn;
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

    for (let month = startMonth; month < currentMonth; month++) {
      const diff = (netByMonth.get(month) ?? 0) - targetAmount;
      accumulatedBalance += diff;
      if (diff < 0) missedMonths++;
    }

    const arrears = accumulatedBalance < 0 ? Math.abs(accumulatedBalance) : 0;
    const credit = accumulatedBalance > 0 ? accumulatedBalance : 0;

    // totalDue: used only for bar display (how much is nominally owed this period
    // after credit/arrears are applied). NOT used for status.
    const totalDue = Math.max(targetAmount - credit, 0) + arrears;

    // ── Unified balance ───────────────────────────────────────────────────
    // Combines all past carryover + this period's net + this period's target.
    // Positive = ahead of schedule, zero = exactly on track, negative = behind.
    //
    // Example: credit=200, net=0, target=200 → totalBalance=0 → "on_track"
    //   (credit consumed by this month's target; not ahead, just current)
    // Example: credit=400, net=0, target=200 → totalBalance=200 → "ahead"
    //   (one month of credit remains after covering this month)
    const totalBalance = accumulatedBalance + currentPeriodNet - targetAmount;

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
      const diff = (netByYear.get(y) ?? 0) - targetAmount;
      accumulatedBalance += diff;
      if (diff < 0) missedMonths++;
    }

    const arrears = accumulatedBalance < 0 ? Math.abs(accumulatedBalance) : 0;
    const credit = accumulatedBalance > 0 ? accumulatedBalance : 0;
    const totalDue = Math.max(targetAmount - credit, 0) + arrears;

    const totalBalance = accumulatedBalance + currentPeriodNet - targetAmount;
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
  const remaining = Math.max(targetAmount - totalSaved, 0);

  let monthsLeft: number | undefined;
  let monthlyRequired: number | undefined;
  let yearlyRequired: number | undefined;

  if (goal.deadline) {
    const now = new Date();
    const deadline = toDate(goal.deadline);
    monthsLeft = Math.max(Math.ceil((deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth())), 0);
    if (monthsLeft > 0) {
      monthlyRequired = remaining / monthsLeft;
      yearlyRequired = monthlyRequired * 12;
    }
  }

  let status: InvestmentGoalStatus | undefined;

  if (totalSaved >= targetAmount) {
    status = "completed";
  } else if (monthlyRequired !== undefined) {
    const createdAt = toDate(goal.createdAt);
    const now = new Date();
    const monthsSinceStart = Math.max(Math.ceil((now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth())), 1);
    const avgMonthly = totalSaved / monthsSinceStart;
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
    status,
    contributionCount,
    withdrawalCount,
    lastContributionDate,
  };
}
