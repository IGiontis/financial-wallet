import type { InvestmentGoal, InvestmentContribution, InvestmentGoalWithStats, InvestmentGoalStatus } from "../../shared/types/IndexTypes";

// ─── Compute stats for a single goal ─────────────────────────────────────────
// Takes a raw InvestmentGoal from Firestore + its contributions
// and returns the full InvestmentGoalWithStats the UI needs.

export function computeGoalStats(goal: InvestmentGoal, contributions: InvestmentContribution[]): InvestmentGoalWithStats {
  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalDeposited = contributions.filter((c) => c.contributionType === "deposit").reduce((sum, c) => sum + c.amount, 0);

  const totalWithdrawn = contributions.filter((c) => c.contributionType === "withdrawal").reduce((sum, c) => sum + c.amount, 0);

  const totalSaved = totalDeposited - totalWithdrawn;

  // ── Contribution counts ─────────────────────────────────────────────────────
  const contributionCount = contributions.filter((c) => c.contributionType === "deposit").length;

  const withdrawalCount = contributions.filter((c) => c.contributionType === "withdrawal").length;

  // ── Last contribution date ──────────────────────────────────────────────────
  const sorted = [...contributions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastContributionDate = sorted[0]?.date ? new Date(sorted[0].date) : undefined;

  // ── Open-ended goals — no computed targets ──────────────────────────────────
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

  // ── Targeted goal computed fields ───────────────────────────────────────────
  const targetAmount = goal.targetAmount ?? 0;
  const percentageReached = targetAmount > 0 ? (totalSaved / targetAmount) * 100 : 0;
  const remaining = Math.max(targetAmount - totalSaved, 0);

  // Months left until deadline
  let monthsLeft: number | undefined;
  let monthlyRequired: number | undefined;
  let yearlyRequired: number | undefined;

  if (goal.deadline) {
    const now = new Date();
    const deadlineRaw = goal.deadline as any;
    const deadline = deadlineRaw?.seconds ? new Date(deadlineRaw.seconds * 1000) : new Date(deadlineRaw);
    monthsLeft = Math.max(Math.ceil((deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth())), 0);
    if (monthsLeft > 0) {
      monthlyRequired = remaining / monthsLeft;
      yearlyRequired = monthlyRequired * 12;
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  // Logic: ±10% tolerance on monthly required amount
  let status: InvestmentGoalStatus | undefined;

  if (totalSaved >= targetAmount) {
    status = "completed";
  } else if (monthlyRequired !== undefined) {
    const createdAtRaw = goal.createdAt as any;
    const createdAt = createdAtRaw?.seconds ? new Date(createdAtRaw.seconds * 1000) : new Date(createdAtRaw);

    const monthsSinceStart = Math.max(Math.ceil((new Date().getFullYear() - createdAt.getFullYear()) * 12 + (new Date().getMonth() - createdAt.getMonth())), 1);
    const avgMonthly = totalSaved / monthsSinceStart;

    if (avgMonthly >= monthlyRequired * 1.1) {
      status = "ahead";
    } else if (avgMonthly >= monthlyRequired * 0.9) {
      status = "on_track";
    } else {
      status = "behind";
    }
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
