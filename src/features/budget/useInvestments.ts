import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { useAuth } from "../../shared/hooks/useAuth";
import {
  getInvestmentGoals,
  createInvestmentGoal,
  updateInvestmentGoal,
  deleteInvestmentGoal,
  closeInvestmentGoal,
  getAllContributions,
  createContributionWithTransaction,
  deleteContribution,
  newDocId,
  type CoveredErase,
} from "../../firebase/firestore";
import { computeGoalStats } from "./investmentsUtils";
import { debtKeys } from "../debts/useDebts";

/** Thrown when a loan to take back with its goal turned out to have repayments — see `coveredErasure`. */
export { CoveredRepaidError } from "../../firebase/firestore";
import type {
  CreateInvestmentGoalDTO,
  DebtWithStatus,
  UpdateInvestmentGoalDTO,
  CreateInvestmentContributionDTO,
  InvestmentGoal,
  InvestmentGoalWithStats,
  InvestmentContribution,
  CreateTransactionDTO,
  Transaction,
} from "../../shared/types/IndexTypes";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { confirmList, editList, idsFor, mergeFields, removeWhere, restoreList, upsertById, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import { sameAsStored } from "../../shared/utils/sameValues";

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

interface CreateGoalVars {
  data: CreateInvestmentGoalDTO;
  isActive: boolean;
}

/** One id per save, shared by the goal put on screen and the write — see `idsFor`. */
const goalIds = new WeakMap<CreateGoalVars, string>();

/**
 * A new goal is on the page the moment it is saved, not after the server has
 * answered and the list been read again: on a slow phone that was two round
 * trips, the dialog long closed, and the goal nowhere until another tab was
 * opened and back.
 */
export function useCreateGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const idOf = (vars: CreateGoalVars) => idsFor(goalIds, vars, () => newDocId("investmentGoals"));

  return useOnceMutation<string, Error, CreateGoalVars, { goal: InvestmentGoal; goals: ListSnapshot<InvestmentGoal> }>({
    onceBy: sameCall,
    mutationFn: (vars) => createInvestmentGoal(userId, vars.data, vars.isActive, idOf(vars)),
    onMutate: async (vars) => {
      const now = new Date();
      const goal = { ...withoutUndefined(vars.data), id: idOf(vars), userId, isActive: vars.isActive, isCompleted: false, createdAt: now, updatedAt: now } as InvestmentGoal;
      return { goal, goals: await editList(queryClient, investmentKeys.goals(userId), upsertById(goal)) };
    },
    onError: (_error, _vars, context) => restoreList(queryClient, context?.goals),
    onSuccess: (_id, _vars, context) => {
      // Goals only: nothing here writes a contribution.
      if (context) confirmList(queryClient, investmentKeys.goals(userId), upsertById(context.goal));
    },
  });
}

// ─── useUpdateGoal ────────────────────────────────────────────────────────────

export function useUpdateGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  // On screen at once, as every edit is (`saveWithoutWaiting`): the dialog
  // closes without waiting for the server, so the goal must already read as
  // saved — and is put back if the write is refused. `null` takes a field off,
  // as the write does (`updateInvestmentGoal`).
  const merge = (goalId: string, data: UpdateInvestmentGoalDTO) => (rows: InvestmentGoal[]) =>
    rows.map((row) => (row.id === goalId ? mergeFields(row, { ...data, updatedAt: new Date() }) : row));

  return useOnceMutation<void, Error, { goalId: string; data: UpdateInvestmentGoalDTO }, { goals: ListSnapshot<InvestmentGoal> }>({
    onceBy: sameCall,
    // The goal as stored already says all of it: nothing is written. As
    // `updateInvestmentGoal` writes it: undefined is left as stored, `null` takes a field off.
    unchangedWhen: ({ goalId, data }) => sameAsStored(queryClient.getQueryData<InvestmentGoal[]>(investmentKeys.goals(userId))?.find((g) => g.id === goalId), withoutUndefined(data)),
    mutationFn: ({ goalId, data }) => updateInvestmentGoal(goalId, data),
    onMutate: async ({ goalId, data }) => ({ goals: await editList(queryClient, investmentKeys.goals(userId), merge(goalId, data)) }),
    onError: (_error, _vars, context) => restoreList(queryClient, context?.goals),
    onSuccess: () => {
      // Goals only: nothing here writes a contribution.
      void queryClient.invalidateQueries({ queryKey: investmentKeys.goals(userId) });
    },
  });
}

// ─── useDeleteGoal ────────────────────────────────────────────────────────────
// Takes the goal's contributions and their mirrored transactions with it — see
// `deleteInvestmentGoal`. Deletes wait for a connection and the dialog waits
// for the answer, so the lists are edited once the server has agreed. A goal
// someone paid part of may take loans back with it (`erase`, see `CoveredErase`).

/** A goal's id, or its id with the loans taken back with it. */
export type GoalDeleteVars = string | { goalId: string; erase?: CoveredErase[] };
const goalOf = (vars: GoalDeleteVars) => (typeof vars === "string" ? { goalId: vars, erase: [] } : { goalId: vars.goalId, erase: vars.erase ?? [] });

export function useDeleteGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({
    onceBy: (vars: GoalDeleteVars) => goalOf(vars).goalId,
    mutationFn: (vars: GoalDeleteVars) => {
      const { goalId, erase } = goalOf(vars);
      return erase.length > 0 ? deleteInvestmentGoal(userId, goalId, erase) : deleteInvestmentGoal(userId, goalId);
    },
    onSuccess: (deleted, vars) => {
      const { goalId } = goalOf(vars);
      confirmList(queryClient, investmentKeys.goals(userId), removeWhere<InvestmentGoal>((g) => g.id === goalId));
      confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.goalId === goalId));
      // The same rule the delete used: only a contribution's mirror carries a goalId —
      // and by id, what went with the loans taken back (their expenses and cash records).
      const gone = new Set(deleted?.transactionIds ?? []);
      confirmList(queryClient, transactionKeys.all(userId), removeWhere<Transaction>((t) => t.goalId === goalId || gone.has(t.id)));
      forgetDebts(queryClient, userId, deleted?.debtIds);
    },
  });
}

/** Loans taken back with a goal leave the debts list too. */
function forgetDebts(queryClient: ReturnType<typeof useQueryClient>, userId: string, debtIds: string[] | undefined) {
  if (!debtIds?.length) return;
  const gone = new Set(debtIds);
  confirmList(queryClient, debtKeys.all(userId), removeWhere<DebtWithStatus>((d) => gone.has(d.id)));
}

// ─── useCloseGoal ─────────────────────────────────────────────────────────────
// The goal done and its money spent — see `closingRecords` and `closeInvestmentGoal`.

export function useCloseGoal() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({
    onceBy: (vars: { goalId: string }) => vars.goalId,
    mutationFn: ({ goalId, records, erase = [] }: { goalId: string; records: CreateTransactionDTO[]; erase?: CoveredErase[] }) =>
      closeInvestmentGoal(
        userId,
        goalId,
        records.map((data) => ({ id: newDocId("transactions"), data })),
        erase,
      ),
    onSuccess: (closed, { goalId }) => {
      confirmList(queryClient, investmentKeys.goals(userId), removeWhere<InvestmentGoal>((g) => g.id === goalId));
      confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.goalId === goalId));
      // The closing records are new: the list reads just them on its next sync.
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
      forgetDebts(queryClient, userId, closed?.debtIds);
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
  accountId: data.accountId,
  heldBy: data.heldBy,
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

  return useOnceMutation<{ contributionId: string; transactionId: string }, Error, AddContributionVars, AddContext>({
    // Contribution record + its mirrored TransactionsPage entry, written
    // atomically so a partial failure can't leave the totals out of sync.
    onceBy: sameCall,
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

  return useOnceMutation({
    onceBy: (contribution: InvestmentContribution) => contribution.id,
    mutationFn: (contribution: InvestmentContribution) => deleteContribution(userId, contribution),
    onSuccess: ({ transactionId }, contribution) => {
      confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.id === contribution.id));
      if (transactionId) confirmList(queryClient, transactionKeys.all(userId), removeWhere<Transaction>((t) => t.id === transactionId));
    },
  });
}
