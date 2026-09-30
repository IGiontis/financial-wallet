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
  newDocId,
} from "../../firebase/firestore";
import { computeGoalStats } from "./investmentsUtils";
import type {
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  CreateInvestmentContributionDTO,
  InvestmentGoal,
  InvestmentGoalWithStats,
  InvestmentContribution,
  CreateTransactionDTO,
  Transaction,
} from "../../shared/types/IndexTypes";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { confirmList, editList, idsFor, removeWhere, restoreList, upsertById, withoutUndefined, type ListSnapshot } from "../../lib/listCache";

// ─── Query keys ───────────────────────────────────────────────────────────────
// Goals and contributions are two separate queries under a shared prefix. Each
// is fetched once no matter how many components ask for it, and each is
// refreshed on its own: a write that touches only goals should not re-read every
// contribution the user has ever made. Invalidating the shared prefix did
// exactly that — pausing one goal cost a full second read of the larger of the
// two collections, for nothing.

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
      // Goals only: nothing here writes a contribution.
      void queryClient.invalidateQueries({ queryKey: investmentKeys.goals(userId) });
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
      // Goals only: nothing here writes a contribution.
      void queryClient.invalidateQueries({ queryKey: investmentKeys.goals(userId) });
    },
  });
}

// ─── useDeleteGoal ────────────────────────────────────────────────────────────
// Takes the goal's contributions and their mirrored transactions with it — see
// `deleteInvestmentGoal`. Deletes wait for a connection and the dialog waits
// for the answer, so the three lists are edited once the server has agreed.

export function useDeleteGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (goalId: string) => deleteInvestmentGoal(userId, goalId),
    onSuccess: (_deleted, goalId) => {
      confirmList(queryClient, investmentKeys.goals(userId), removeWhere<InvestmentGoal>((g) => g.id === goalId));
      confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.goalId === goalId));
      // The same rule the delete used: only a contribution's mirror carries a goalId.
      confirmList(queryClient, transactionKeys.all(userId), removeWhere<Transaction>((t) => t.goalId === goalId));
    },
  });
}

// ─── useAddContribution ───────────────────────────────────────────────────────
// isGoalTransaction: true  → from GoalsPage  (targeted goal, yellow in UI)
// isGoalTransaction: false → from InvestmentsPage (recurring/tracking, blue in UI)

export interface AddContributionVars {
  data: CreateInvestmentContributionDTO;
  goalName: string;
  isGoalTransaction?: boolean;
}

/** The TransactionsPage entry a contribution is mirrored as. */
const mirrorOf = ({ data, goalName, isGoalTransaction = false }: AddContributionVars): CreateTransactionDTO => ({
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

/** One pair of ids per save, shared by the optimistic rows and the write — see `idsFor`. */
const contributionIds = new WeakMap<AddContributionVars, { contributionId: string; transactionId: string }>();

interface AddContext {
  contribution: InvestmentContribution;
  mirror: Transaction;
  contributions: ListSnapshot<InvestmentContribution>;
  transactions: ListSnapshot<Transaction>;
}

export function useAddContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const idsOf = (vars: AddContributionVars) =>
    idsFor(contributionIds, vars, () => ({ contributionId: newDocId("investmentContributions"), transactionId: newDocId("transactions") }));

  return useMutation<{ contributionId: string; transactionId: string }, Error, AddContributionVars, AddContext>({
    // Contribution record + its mirrored TransactionsPage entry, written
    // atomically so a partial failure can't leave the totals out of sync.
    mutationFn: (vars: AddContributionVars) => createContributionWithTransaction(userId, vars.data, mirrorOf(vars), idsOf(vars)),

    // Both rows on screen at once, under the ids they will keep. The goal
    // document is not written here — completion is derived on read, in
    // `useInvestmentGoals` — so there is nothing to change about the goals.
    onMutate: async (vars) => {
      const { contributionId, transactionId } = idsOf(vars);
      const now = new Date();
      const contribution = { ...withoutUndefined(vars.data), id: contributionId, userId, createdAt: now, updatedAt: now } as InvestmentContribution;
      const mirror = { ...withoutUndefined(mirrorOf(vars)), id: transactionId, userId, createdAt: now, updatedAt: now } as Transaction;
      return {
        contribution,
        mirror,
        contributions: await editList(queryClient, investmentKeys.contributions(userId), upsertById(contribution)),
        transactions: await editList(queryClient, transactionKeys.all(userId), insertTransaction(mirror)),
      };
    },

    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.contributions);
      restoreList(queryClient, context?.transactions);
    },

    onSuccess: (_ids, _vars, context) => {
      if (!context) return;
      confirmList(queryClient, investmentKeys.contributions(userId), upsertById(context.contribution));
      confirmList(queryClient, transactionKeys.all(userId), insertTransaction(context.mirror));
    },
  });
}

// ─── useDeleteContribution ────────────────────────────────────────────────────
// Takes the contribution's mirrored transaction with it — see `deleteContribution`
// for how that one is recognised.

export function useDeleteContribution() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (contribution: InvestmentContribution) => deleteContribution(userId, contribution),
    onSuccess: ({ transactionId }, contribution) => {
      confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.id === contribution.id));
      if (transactionId) confirmList(queryClient, transactionKeys.all(userId), removeWhere<Transaction>((t) => t.id === transactionId));
    },
  });
}
