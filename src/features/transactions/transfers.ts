import type { Transaction } from "../../shared/types/IndexTypes";
import { TRANSFER_CATEGORY_ID } from "../../shared/utils/categories";

// ─── Moving money between your own accounts ──────────────────────────────────
//
// 200 taken out of Revolut as cash, 500 sent from Eurobank to Ethniki. Nothing
// was earned or spent; the money changed account. It is written as two
// transactions under one transfer id — an expense on the account it left and
// an income on the account it reached — so every account's balance moves by
// itself, the total does not move, and every report that counts what came in
// or went out leaves both out (`isMoneyMove`).
//
// The ids are fixed by the transfer's own, so saving a corrected transfer
// writes the same two documents again rather than leaving the old pair behind.

export interface TransferInput {
  /** The transfer's id; the two halves are named after it. */
  id: string;
  from: string;
  to: string;
  amount: number;
  date: Date;
  /** "Revolut → Μετρητά": what the list shows, and what search finds. */
  label: string;
  note?: string;
}

/** A half as it is written, before the user and the timestamps are added. */
export type TransferRecord = Pick<Transaction, "id" | "type" | "amount" | "date" | "accountId" | "categoryId" | "description" | "transferId" | "transferPart"> & { notes?: string };

export const transferIds = (id: string) => ({ out: `xfer_${id}_out`, in: `xfer_${id}_in` });

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The two halves of a transfer: out of `from`, into `to`, the same amount. */
export function transferRecords(input: TransferInput): [TransferRecord, TransferRecord] {
  const ids = transferIds(input.id);
  const amount = round2(input.amount);
  const common = { amount, date: input.date, categoryId: TRANSFER_CATEGORY_ID, description: input.label, transferId: input.id, ...(input.note ? { notes: input.note } : {}) };
  return [
    { ...common, id: ids.out, type: "expense", accountId: input.from, transferPart: "out" },
    { ...common, id: ids.in, type: "income", accountId: input.to, transferPart: "in" },
  ];
}

/** Both halves of a transfer, found in a list of transactions. */
export function transferOf(transactions: Transaction[], transferId: string): { out?: Transaction; in?: Transaction } {
  const halves = transactions.filter((tx) => tx.transferId === transferId);
  return { out: halves.find((tx) => tx.transferPart === "out"), in: halves.find((tx) => tx.transferPart === "in") };
}

/**
 * The transactions as the list shows them: a transfer once, by its "out" half,
 * rather than as a pair that reads like money both spent and earned.
 */
export function oneRowPerTransfer(transactions: Transaction[]): Transaction[] {
  return transactions.filter((tx) => tx.transferPart !== "in");
}

export type TransferProblem = "sameAccount" | "noAccount" | "amount";

/** What stops a transfer from being saved, if anything. */
export function transferProblem(input: Pick<TransferInput, "from" | "to" | "amount">): TransferProblem | undefined {
  if (!input.from || !input.to) return "noAccount";
  if (input.from === input.to) return "sameAccount";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "amount";
  return undefined;
}
