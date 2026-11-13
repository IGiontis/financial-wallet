import { useMemo } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { getDebtsByIds } from "../../firebase/firestore";
import { useDebts } from "../debts/useDebts";
import { computeDebtStatus } from "../debts/debtsUtils";
import { linkedDebtIds } from "./goalLoans";
import { coveredFundingKey } from "./useCoveredFunding";
import type { DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

/**
 * The debts a goal's delete has to ask about, complete — see `goalLoans`.
 *
 * The owner's report (2026-11-12): a goal deleted right after someone's payment
 * was recorded sometimes left the debt behind without asking. The dialog read
 * only the debts this device happened to hold: still loading, it read as no
 * debts at all; loaded before the new debt reached it, the person's deposit was
 * there (written on screen at once) but the debt was not. Either way nothing
 * was asked and the debt stayed.
 *
 * Now the debts list is waited for, and any debt the goal's deposits name
 * (`contribution.debtId`) that the list does not hold is read from the server
 * by its id — one read a debt plus one query of its repayments, only then. A
 * goal with no such debts costs nothing.
 *
 * And while a "someone paid it for me" save is still on its way, the goal's
 * delete waits for it: deleted between the save and the debt's money that
 * follows it (`useCoveredFunding` → `sync`), the money would be written for a
 * debt already gone.
 */
export function useGoalLoans(goal: Pick<InvestmentGoalWithStats, "id" | "covered">): { debts: DebtWithStatus[]; loading: boolean } {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const list = useDebts();
  const cached = list.data;
  const settled = list.isSuccess || list.isError;
  const saving = useIsMutating({ mutationKey: coveredFundingKey }) > 0;
  const linked = useMemo(() => linkedDebtIds(goal), [goal]);
  const missing = useMemo(() => (settled ? linked.filter((id) => !(cached ?? []).some((d) => d.id === id)) : []), [settled, linked, cached]);

  const server = useQuery({
    queryKey: ["goalLoans", userId, goal.id, missing.join("|")],
    enabled: !!userId && missing.length > 0,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { debts, payments } = await getDebtsByIds(userId, missing);
      return debts.map((debt) => computeDebtStatus(debt, payments));
    },
  });

  const debts = useMemo(() => {
    const own = cached ?? [];
    const read = (missing.length > 0 ? server.data : undefined) ?? [];
    return [...own, ...read.filter((d) => !own.some((o) => o.id === d.id))];
  }, [cached, server.data, missing.length]);

  // Signed out (tests, the first paint) there is nothing to wait for.
  const loading = !!userId && (!settled || saving || (missing.length > 0 && !server.isSuccess));
  return { debts, loading };
}
