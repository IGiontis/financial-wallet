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
    return { ...goal, totalDeposited, totalWithdrawn, totalSaved, contributionCount, withdrawalCount, lastContributionDate };
  }

  const targetAmount = goal.targetAmount ?? 0;

  // ── Recurring monthly goal ────────────────────────────────────────────────
  if (goal.targetPeriod === "monthly") {
    const now = new Date();
    const isThisMonth = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

    const thisMonthDeposits = contributions.filter((c) => c.contributionType === "deposit" && isThisMonth(toDate(c.date))).reduce((sum, c) => sum + c.amount, 0);

    const thisMonthWithdrawals = contributions.filter((c) => c.contributionType === "withdrawal" && isThisMonth(toDate(c.date))).reduce((sum, c) => sum + c.amount, 0);

    // Raw net — can be negative when withdrawals exceed deposits this period.
    const currentPeriodNet = thisMonthDeposits - thisMonthWithdrawals;
    // Clamped only for display (stat cell, bar fill).
    const currentPeriodSaved = Math.max(currentPeriodNet, 0);

    // ── Carryover: walk every past month ─────────────────────────────────
    const goalCreated = toDate(goal.createdAt);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let cursor = new Date(goalCreated.getFullYear(), goalCreated.getMonth(), 1);

    // positive = credit (overpaid), negative = debt (underpaid)
    let accumulatedBalance = 0;
    let missedMonths = 0;

    while (cursor < thisMonthStart) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();

      const mDeposits = contributions
        .filter((c) => c.contributionType === "deposit" && toDate(c.date).getFullYear() === y && toDate(c.date).getMonth() === m)
        .reduce((sum, c) => sum + c.amount, 0);

      const mWithdrawals = contributions
        .filter((c) => c.contributionType === "withdrawal" && toDate(c.date).getFullYear() === y && toDate(c.date).getMonth() === m)
        .reduce((sum, c) => sum + c.amount, 0);

      const diff = mDeposits - mWithdrawals - targetAmount;
      accumulatedBalance += diff;
      if (diff < 0) missedMonths++;

      cursor = new Date(y, m + 1, 1);
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
      percentageReached: totalDue > 0 ? Math.min((currentPeriodNet / totalDue) * 100, 100) : status !== "behind" ? 100 : 0,
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
    const isThisYear = (d: Date) => d.getFullYear() === currentYear;

    const thisYearDeposits = contributions.filter((c) => c.contributionType === "deposit" && isThisYear(toDate(c.date))).reduce((sum, c) => sum + c.amount, 0);

    const thisYearWithdrawals = contributions.filter((c) => c.contributionType === "withdrawal" && isThisYear(toDate(c.date))).reduce((sum, c) => sum + c.amount, 0);

    const currentPeriodNet = thisYearDeposits - thisYearWithdrawals;
    const currentPeriodSaved = Math.max(currentPeriodNet, 0);

    // ── Carryover: walk every past year ──────────────────────────────────
    const goalStartYear = toDate(goal.createdAt).getFullYear();
    let accumulatedBalance = 0;
    let missedMonths = 0;

    for (let y = goalStartYear; y < currentYear; y++) {
      const yDeposits = contributions.filter((c) => c.contributionType === "deposit" && toDate(c.date).getFullYear() === y).reduce((sum, c) => sum + c.amount, 0);

      const yWithdrawals = contributions.filter((c) => c.contributionType === "withdrawal" && toDate(c.date).getFullYear() === y).reduce((sum, c) => sum + c.amount, 0);

      const diff = yDeposits - yWithdrawals - targetAmount;
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
      percentageReached: totalDue > 0 ? Math.min((currentPeriodNet / totalDue) * 100, 100) : status !== "behind" ? 100 : 0,
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
