import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import {
  getInvestmentGoals,
  createInvestmentGoal,
  updateInvestmentGoal,
  deleteInvestmentGoal,
  getContributions,
  getAllContributions,
  createContributionWithTransaction,
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
      // Two reads total (goals + all contributions) instead of one-per-goal (N+1).
      const [goals, allContributions] = await Promise.all([getInvestmentGoals(userId), getAllContributions(userId)]);

      const byGoal = new Map<string, InvestmentContribution[]>();
      for (const c of allContributions) {
        const arr = byGoal.get(c.goalId);
        if (arr) arr.push(c);
        else byGoal.set(c.goalId, [c]);
      }

      // Pure computation — no side-effect writes inside the query. "Completed" is
      // derived on read, so refetch-on-focus never fires redundant Firestore writes.
      const withStats = goals.map((goal) => computeGoalStats(goal, byGoal.get(goal.id) ?? []));
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
      // Contribution record + its mirrored TransactionsPage entry, written
      // atomically so a partial failure can't leave the totals out of sync.
      await createContributionWithTransaction(userId, data, {
        amount: data.amount,
        type: "investment",
        categoryId: "",
        date: data.date,
        description: goalName,
        notes: data.notes,
        isInvestmentTransaction: true,
        isGoalTransaction,
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
