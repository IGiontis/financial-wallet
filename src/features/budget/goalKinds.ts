import type { InvestmentGoal } from "../../shared/types/IndexTypes";

/** A goal set aside for every month or year, as opposed to one reached once. */
export const isRecurringGoal = (g: Pick<InvestmentGoal, "targetPeriod">) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";

/**
 * A goal of «Στόχοι»: an amount to reach once — a trip, a move — not an
 * investment and not a monthly set-aside. What «Στόχοι» lists, and what money
 * borrowed for something can be said to have gone into.
 */
export const isSavingsGoal = (g: Pick<InvestmentGoal, "goalType" | "targetPeriod">) => g.goalType === "targeted" && !isRecurringGoal(g);
