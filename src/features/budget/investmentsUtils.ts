import type { InvestmentGoal, InvestmentContribution, InvestmentGoalWithStats, InvestmentGoalStatus } from "../../shared/types/IndexTypes";

const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
};

export function computeGoalStats(goal: InvestmentGoal, contributions: InvestmentContribution[]): InvestmentGoalWithStats {
  // ── Totals ────────────────────────────────────────────────────────────────
  const totalDeposited = contributions.filter((c) => c.contributionType === "deposit").reduce((sum, c) => sum + c.amount, 0);

  const totalWithdrawn = contributions.filter((c) => c.contributionType === "withdrawal").reduce((sum, c) => sum + c.amount, 0);

  const totalSaved = totalDeposited - totalWithdrawn;

  const contributionCount = contributions.filter((c) => c.contributionType === "deposit").length;

  const withdrawalCount = contributions.filter((c) => c.contributionType === "withdrawal").length;

  const sorted = [...contributions].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  const lastContributionDate = sorted[0]?.date ? toDate(sorted[0].date) : undefined;

  // ── Open-ended goals ──────────────────────────────────────────────────────
  if (goal.goalType === "open_ended") {
    return {
      ...goal,
      totalDeposited,
      totalWithdrawn,
      totalSaved,
      contributionCount,
      withdrawalCount,
      lastContributionDate,
    };
  }

  const targetAmount = goal.targetAmount ?? 0;

  // ── Recurring monthly goal (targetPeriod === "monthly") ───────────────────
  // Never auto-completes. Status is based on THIS month's contributions only.
  if (goal.targetPeriod === "monthly") {
    const now = new Date();

    const thisMonthDeposits = contributions
      .filter((c) => {
        const d = toDate(c.date);
        return c.contributionType === "deposit" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, c) => sum + c.amount, 0);

    let status: InvestmentGoalStatus;
    if (thisMonthDeposits >= targetAmount * 1.1) {
      status = "ahead";
    } else if (thisMonthDeposits >= targetAmount * 0.9) {
      status = "on_track";
    } else {
      status = "behind";
    }

    return {
      ...goal,
      totalDeposited,
      totalWithdrawn,
      totalSaved, // all-time total still tracked
      percentageReached: targetAmount > 0 ? (thisMonthDeposits / targetAmount) * 100 : 0,
      remaining: Math.max(targetAmount - thisMonthDeposits, 0),
      monthlyRequired: targetAmount,
      currentPeriodSaved: thisMonthDeposits, // this month only
      status,
      contributionCount,
      withdrawalCount,
      lastContributionDate,
    };
  }

  // ── Recurring yearly goal (targetPeriod === "yearly") ─────────────────────
  if (goal.targetPeriod === "yearly") {
    const now = new Date();

    const thisYearDeposits = contributions
      .filter((c) => {
        const d = toDate(c.date);
        return c.contributionType === "deposit" && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, c) => sum + c.amount, 0);

    let status: InvestmentGoalStatus;
    if (thisYearDeposits >= targetAmount * 1.1) {
      status = "ahead";
    } else if (thisYearDeposits >= targetAmount * 0.9) {
      status = "on_track";
    } else {
      status = "behind";
    }

    return {
      ...goal,
      totalDeposited,
      totalWithdrawn,
      totalSaved,
      percentageReached: targetAmount > 0 ? (thisYearDeposits / targetAmount) * 100 : 0,
      remaining: Math.max(targetAmount - thisYearDeposits, 0),
      yearlyRequired: targetAmount,
      currentPeriodSaved: thisYearDeposits,
      status,
      contributionCount,
      withdrawalCount,
      lastContributionDate,
    };
  }

  // ── One-time targeted goal (targetPeriod === "custom" or no period) ────────
  // This is the original logic — can complete when target is reached.
  const percentageReached = targetAmount > 0 ? (totalSaved / targetAmount) * 100 : 0;
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

    if (avgMonthly >= monthlyRequired * 1.1) status = "ahead";
    else if (avgMonthly >= monthlyRequired * 0.9) status = "on_track";
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
