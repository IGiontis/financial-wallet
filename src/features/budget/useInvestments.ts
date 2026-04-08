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
} from "../../firebase/firestore";
import { computeGoalStats } from "./investmentsUtils";
import type {
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  CreateInvestmentContributionDTO,
  InvestmentGoalWithStats,
  InvestmentContribution,
} from "../../shared/types/IndexTypes";

// ─── Query keys ───────────────────────────────────────────────────────────────
// Centralised so invalidation is consistent everywhere

export const investmentKeys = {
  all: (userId: string) => ["investments", userId] as const,
  contributions: (goalId: string) => ["contributions", goalId] as const,
};

// ─── useInvestmentGoals ───────────────────────────────────────────────────────
// Fetches all goals for the current user and computes stats for each one.
// Contributions for each goal are fetched in parallel.

export function useInvestmentGoals() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<InvestmentGoalWithStats[]>({
    queryKey: investmentKeys.all(userId),
    enabled: !!userId,
    queryFn: async () => {
      const goals = await getInvestmentGoals(userId);
      const contributionArrays = await Promise.all(goals.map((g) => getContributions(g.id)));
      const withStats = goals.map((goal, i) => computeGoalStats(goal, contributionArrays[i]));

      // Auto-mark completed goals in Firestore
      const completionUpdates = withStats
        .filter((g) => g.status === "completed" && !g.isCompleted)
        .map((g) =>
          updateInvestmentGoal(g.id, {
            isCompleted: true,
            completedAt: new Date(),
          }),
        );

      if (completionUpdates.length > 0) {
        await Promise.all(completionUpdates);
      }

      return withStats.map((g) => (g.status === "completed" ? { ...g, isCompleted: true } : g));
    },
  });
}

// ─── useContributions ─────────────────────────────────────────────────────────
// Fetches contributions for a single goal — used by HistoryModal.

export function useContributions(goalId: string | null) {
  return useQuery<InvestmentContribution[]>({
    queryKey: investmentKeys.contributions(goalId ?? ""),
    enabled: !!goalId,
    staleTime: 0, // always fetch fresh when modal opens
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
// Used by both AddDepositModal and WithdrawModal.

export function useAddContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (data: CreateInvestmentContributionDTO) => createContribution(userId, data),

    onSuccess: (_result, variables) => {
      // Invalidate both the goal list (stats change) and the contribution list
      queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      queryClient.invalidateQueries({
        queryKey: investmentKeys.contributions(variables.goalId),
      });
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
      queryClient.invalidateQueries({
        queryKey: investmentKeys.contributions(goalId),
      });
    },
  });
}
