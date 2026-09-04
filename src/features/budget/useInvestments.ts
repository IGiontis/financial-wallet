import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import {
  getInvestmentGoals,
  createInvestmentGoal,
  updateInvestmentGoal,
  deleteInvestmentGoal,
  getAllContributions,
  createContributionWithTransaction,
  deleteContribution,
} from "../../firebase/firestore";
import { computeGoalStats } from "./investmentsUtils";
import type {
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  CreateInvestmentContributionDTO,
  InvestmentGoal,
  InvestmentGoalWithStats,
  InvestmentContribution,
} from "../../shared/types/IndexTypes";
import { transactionKeys } from "../transactions/hooks/useTransactions";

// ─── Query keys ───────────────────────────────────────────────────────────────
// Goals and contributions are two separate queries under a shared prefix, so a
// single invalidate on `all` refreshes both, while each is fetched only once
// no matter how many components ask for it.

export const investmentKeys = {
  all: (userId: string) => ["investments", userId] as const,
  goals: (userId: string) => ["investments", userId, "goals"] as const,
  contributions: (userId: string) => ["investments", userId, "contributions"] as const,
};

// ─── useAllContributions ──────────────────────────────────────────────────────
// Every contribution the user has, in one query. Per-goal views filter this
// list rather than issuing their own `where goalId ==` read.

export function useAllContributions() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<InvestmentContribution[]>({
    queryKey: investmentKeys.contributions(userId),
    enabled: !!userId,
    queryFn: () => getAllContributions(userId),
  });
}

// ─── useInvestmentGoals ───────────────────────────────────────────────────────

export function useInvestmentGoals() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  const goalsQuery = useQuery<InvestmentGoal[]>({
    queryKey: investmentKeys.goals(userId),
    enabled: !!userId,
    queryFn: () => getInvestmentGoals(userId),
  });

  const contributionsQuery = useAllContributions();

  const data = useMemo<InvestmentGoalWithStats[]>(() => {
    const goals = goalsQuery.data;
    const contributions = contributionsQuery.data;
    if (!goals || !contributions) return [];

    const byGoal = new Map<string, InvestmentContribution[]>();
    for (const c of contributions) {
      const arr = byGoal.get(c.goalId);
      if (arr) arr.push(c);
      else byGoal.set(c.goalId, [c]);
    }

    // Pure computation — no side-effect writes. "Completed" is derived on read,
    // so a refetch never fires redundant Firestore writes.
    return goals
      .map((goal) => computeGoalStats(goal, byGoal.get(goal.id) ?? []))
      .map((g) => (g.status === "completed" ? { ...g, isCompleted: true } : g));
  }, [goalsQuery.data, contributionsQuery.data]);

  return {
    data,
    isLoading: goalsQuery.isLoading || contributionsQuery.isLoading,
    isError: goalsQuery.isError || contributionsQuery.isError,
    isFetching: goalsQuery.isFetching || contributionsQuery.isFetching,
  };
}

// ─── useContributions ─────────────────────────────────────────────────────────
// A single goal's contributions, filtered out of the shared list — no extra read.

export function useContributions(goalId: string | null) {
  const { data = [], isLoading, isError } = useAllContributions();

  const filtered = useMemo(() => (goalId ? data.filter((c) => c.goalId === goalId) : []), [data, goalId]);

  return { data: filtered, isLoading, isError };
}

// ─── useCreateGoal ────────────────────────────────────────────────────────────

export function useCreateGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ data, isActive }: { data: CreateInvestmentGoalDTO; isActive: boolean }) => createInvestmentGoal(userId, data, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
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
      void queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
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
      void queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}

// ─── useDeleteContribution ────────────────────────────────────────────────────

export function useDeleteContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (contributionId: string) => deleteContribution(contributionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: investmentKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}
