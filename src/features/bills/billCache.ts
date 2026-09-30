import type { QueryClient } from "@tanstack/react-query";
import { computeBillStatus } from "./billsUtils";
import type { ListEdit } from "../../lib/listCache";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// The cached bills list and the edits that keep it true after a write.
//
// Its own module rather than part of `useBills` because the Transactions screen
// edits it too — deleting a bill's expense unpays the bill — and `useBills`
// already imports from the transactions hooks.

export const billKeys = {
  all: (userId: string) => ["bills", userId] as const,
};

/** Unpaid first, then by name — the order `useBills` hands to the page. */
export const byUrgency = (a: BillWithStatus, b: BillWithStatus) => Number(a.isPaidThisPeriod) - Number(b.isPaidThisPeriod) || a.name.localeCompare(b.name);

/**
 * Re-derives every bill's status after its bills or its payments were edited.
 *
 * Deliberately routed back through `computeBillStatus` rather than patching the
 * flags by hand: "paid" pulls a dozen derived fields with it, and a shortcut
 * here would drift from what a refetch produces.
 */
function rederive(bills: Bill[], payments: BillPayment[]): BillWithStatus[] {
  const now = new Date();
  return bills.map((bill) => computeBillStatus(bill, payments, now)).sort(byUrgency);
}

/** An edit to the payments inside the list, with every status worked out again. */
export const editPayments =
  (edit: (payments: BillPayment[]) => BillPayment[]): ListEdit<BillWithStatus> =>
  (bills) =>
    rederive(bills, edit(bills.flatMap((b) => b.payments)));

/** An edit to the bills themselves — added, changed, removed — likewise. */
export const editBills =
  (edit: (bills: Bill[]) => Bill[]): ListEdit<BillWithStatus> =>
  (bills) =>
    rederive(edit(bills), bills.flatMap((b) => b.payments));

/** The payment recorded with a bill's expense, if the bills on screen know it. */
export function paymentIdFor(queryClient: QueryClient, userId: string, transactionId: string): string | undefined {
  return queryClient
    .getQueryData<BillWithStatus[]>(billKeys.all(userId))
    ?.flatMap((b) => b.payments)
    .find((p) => p.transactionId === transactionId)?.id;
}
