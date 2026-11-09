import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { getAllContributions, getInvestmentGoals } from "../../firebase/firestore";
import { investmentKeys } from "./useInvestments";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { useDebts } from "../debts/useDebts";
import { coveredLinkOf, type CoveredLink } from "./coveredLink";
import type { Debt, InvestmentContribution, InvestmentGoal } from "../../shared/types/IndexTypes";

export interface CoveredLinkState {
  link: CoveredLink | undefined;
  goalName: string | undefined;
  /** All the lists are in: a save made before then would not know what else it has to change. */
  ready: boolean;
  /** One of them could not be read. Said, with `retry`, rather than a Save that never wakes. */
  failed: boolean;
  retry: () => void;
}

/**
 * The goal's deposit and the expense tied to a debt that paid part of a goal —
 * see `coveredLinkOf`. The lists are the shared ones, under the same keys, and
 * the goals' two asked for only when the debt is of this kind: an ordinary debt
 * costs no read. Every debt is needed too — see `coveredExpenses` — and on the
 * Debts page that list is already in.
 */
export function useCoveredLink(debt: Debt | null | undefined): CoveredLinkState {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const wanted = !!userId && !!debt?.forGoalId;
  const contributions = useQuery<InvestmentContribution[]>({ queryKey: investmentKeys.contributions(userId), enabled: wanted, queryFn: () => getAllContributions(userId) });
  const goals = useQuery<InvestmentGoal[]>({ queryKey: investmentKeys.goals(userId), enabled: wanted, queryFn: () => getInvestmentGoals(userId) });
  const transactions = useTransactions({ fetch: wanted });
  const debts = useDebts();

  return useMemo(() => {
    const queries = [contributions, goals, transactions, debts];
    const retry = () => {
      for (const q of queries) if (q.isError) void q.refetch();
    };
    if (!debt?.forGoalId) return { link: undefined, goalName: undefined, ready: true, failed: false, retry };
    const ready = !!contributions.data && !!goals.data && !!transactions.data && !!debts.data;
    const failed = !ready && queries.some((q) => q.isError);
    const link = ready ? coveredLinkOf(debt, debts.data!, contributions.data!, transactions.data!, goals.data!) : undefined;
    return { link, goalName: goals.data?.find((g) => g.id === debt.forGoalId)?.name?.trim(), ready, failed, retry };
  }, [debt, contributions, goals, transactions, debts]);
}
