import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import {
  getInvestmentGoals,
  createInvestmentGoal,
  updateInvestmentGoal,
  deleteInvestmentGoal,
  getContributions,
  createContribution,
  deleteContribution,
  createTransaction,
} from "../../firebase/firestore";
import { computeGoalStats } from "./investmentsUtils";
import type {
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  CreateInvestmentContributionDTO,
  InvestmentGoalWithStats,
  InvestmentContribution,
} from "../../shared/types/IndexTypes";
import { transactionKeys } from "../transactions/hooks/useTransactions";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const investmentKeys = {
  all: (userId: string) => ["investments", userId] as const,
  contributions: (goalId: string) => ["contributions", goalId] as const,
};

// ─── useInvestmentGoals ───────────────────────────────────────────────────────

export function useInvestmentGoals() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<InvestmentGoalWithStats[]>({
    queryKey: investmentKeys.all(userId),
    enabled: !!userId,
    staleTime: 0,
    queryFn: async () => {
      const goals = await getInvestmentGoals(userId);
      const contributionArrays = await Promise.all(goals.map((g) => getContributions(g.id)));
      const withStats = goals.map((goal, i) => computeGoalStats(goal, contributionArrays[i]));

      // Auto-mark completed goals in Firestore
      const completionUpdates = withStats
        .filter((g) => g.status === "completed" && !g.isCompleted)
        .map((g) => updateInvestmentGoal(g.id, { isCompleted: true, completedAt: new Date() }));

      if (completionUpdates.length > 0) await Promise.all(completionUpdates);

      return withStats.map((g) => (g.status === "completed" ? { ...g, isCompleted: true } : g));
    },
  });
}

// ─── useContributions ─────────────────────────────────────────────────────────

export function useContributions(goalId: string | null) {
  return useQuery<InvestmentContribution[]>({
    queryKey: investmentKeys.contributions(goalId ?? ""),
    enabled: !!goalId,
    staleTime: 0,
    queryFn: () => getContributions(goalId!),
  });
}

// ─── useCreateGoal ────────────────────────────────────────────────────────────

export function useCreateGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ data, isActive }: { data: CreateInvestmentGoalDTO; isActive: boolean }) => createInvestmentGoal(userId, data, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
    },
  });
}

// ─── useUpdateGoal ────────────────────────────────────────────────────────────

export function useUpdateGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: UpdateInvestmentGoalDTO }) => updateInvestmentGoal(goalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
    },
  });
}

// ─── useDeleteGoal ────────────────────────────────────────────────────────────

export function useDeleteGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (goalId: string) => deleteInvestmentGoal(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
    },
  });
}

// ─── useAddContribution ───────────────────────────────────────────────────────
// When a deposit or withdrawal is made, we also create a Transaction record
// so it appears in the Transactions page as a read-only entry.

export function useAddContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: async ({ data, goalName }: { data: CreateInvestmentContributionDTO; goalName: string }) => {
      // 1. Create the investment contribution as before
      await createContribution(userId, data);

      // 2. Also create a read-only transaction record so it shows
      //    in the Transactions page. Type = "investment", not editable.
      // const isDeposit = data.contributionType === "deposit";
      console.log(data)
      await createTransaction(userId, {
        amount: data.amount,
        type: "investment",
        categoryId: "", // no category for investment transactions
        date: data.date,
        description: goalName,
        notes: data.notes,
        isInvestmentTransaction: true,
        goalId: data.goalId,
        goalName,
        contributionType: data.contributionType,
      });
    },
    onSuccess: (_result, variables) => {
      // Refresh both investment goals and transactions
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: investmentKeys.contributions(variables.data.goalId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}

// ─── useDeleteContribution ────────────────────────────────────────────────────

export function useDeleteContribution(goalId: string) {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (contributionId: string) => deleteContribution(contributionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: investmentKeys.contributions(goalId) });
    },
  });
}
