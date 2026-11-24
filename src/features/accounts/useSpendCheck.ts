import { useMemo } from "react";
import { useMoneyAccounts } from "./useMoneyAccounts";
import { spendCheck, type SpendVerdict } from "./accountsUtils";

/**
 * «Μπορείς να τα βγάλεις από εκεί;» — the one check every form that takes
 * money OUT of an account must make (owner, 2026-11-24, `.claude/rules/ui.md`
 * 22, after a 3,00 € cash balance was taken to −0,50 €).
 *
 * No account may go below zero — «ούτε οι κάρτες» — so the verdict is REFUSE
 * for both kinds and `blocked` is what a form's Save reads. The words differ:
 * cash is not in the pocket, while a card's balance may simply be behind. A
 * card that may really be overdrawn is a later piece of work.
 *
 * It belongs where the AMOUNT is typed, because the card is picked first
 * («WHERE before HOW MUCH») — and it re-runs on every change of either. Pass
 * `undefined` as the account for money coming IN: nothing leaves then. An
 * EDIT passes what the record already takes from that account as `already`,
 * so only the difference is asked for.
 *
 *   const spend = useSpendCheck(values.accountId, amount);
 *   …
 *   <SpendNote check={spend} />
 *   <Button disabled={… || spend.blocked}>
 */
export function useSpendCheck(accountId: string | undefined, amount: number, already = 0): SpendVerdict & { blocked: boolean } {
  const { accounts, latest, transactions } = useMoneyAccounts();
  return useMemo(() => {
    const verdict = spendCheck(accounts, latest, transactions, accountId, amount, already);
    return { ...verdict, blocked: verdict.kind === "refuse" };
  }, [accounts, latest, transactions, accountId, amount, already]);
}
