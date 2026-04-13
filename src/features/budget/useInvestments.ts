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

      const completionUpdates = withStats
        .filter((g) => g.status === "completed" && !g.isCompleted && g.targetPeriod !== "monthly" && g.targetPeriod !== "yearly")
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
    },
  });
}

// ─── useAddContribution ───────────────────────────────────────────────────────
// isGoalTransaction: true  → from GoalsPage  (targeted goal, yellow in UI)
// isGoalTransaction: false → from InvestmentsPage (recurring/tracking, blue in UI)

export function useAddContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: async ({ data, goalName, isGoalTransaction = false }: { data: CreateInvestmentContributionDTO; goalName: string; isGoalTransaction?: boolean }) => {
      // 1. Create the investment contribution record
      await createContribution(userId, data);

      // 2. Create a mirrored transaction so it appears in TransactionsPage
      await createTransaction(userId, {
        amount: data.amount,
        type: "investment",
        categoryId: "",
        date: data.date,
        description: goalName,
        notes: data.notes,
        isInvestmentTransaction: true,
        isGoalTransaction, // ← the new flag
        goalId: data.goalId,
        goalName,
        contributionType: data.contributionType,
      });
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: investmentKeys.contributions(variables.data.goalId) }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) }),
      ]);
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      await queryClient.invalidateQueries({ queryKey: investmentKeys.contributions(goalId) });
    },
  });
}
