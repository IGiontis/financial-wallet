import type { Transaction } from "../../shared/types/IndexTypes";
import { cleanLine } from "../../shared/utils/cleanText";
import { nameKey } from "../../shared/utils/nameMatch";
import { isMoneyMove, isTransfer } from "../../shared/utils/moneyModel";
import { coveredExpenses } from "../budget/coveredLink";

type CoveredDebt = Parameters<typeof coveredExpenses>[0][number];

// ─── Payees: what they are and where they live ───────────────────────────────
//
// A payee is not a document. It is the text in a transaction's `description`
// (the form's «Δικαιούχος» field), matched by `nameKey` — case, accents and
// spacing aside. The user document also keeps `savedPayees`, the short list
// the picker offers; a name typed in the form and never saved is a payee all
// the same, so the page lists both: every saved name, and every name records
// carry, each with how many records carry it.
//
// Records whose description the app writes itself, or takes from a record they
// are linked to, are not payees: a transfer's two halves, a loan's cash, a
// goal's or an investment's money, a bill's payment (named after the bill), an
// income's arrival (named after the income), and the expense a friend's
// covered debt paid for. They are left out of the list, the counts and every
// rename — so a bill or an income keeps matching its own records, and the
// covered-debt refund, which finds an old debt's expense by its description
// (`coveredExpenses`), still finds it.

type PayeeRecord = Pick<Transaction, "id" | "description" | "date" | "debtId" | "debtPart" | "transferId" | "isGoalTransaction" | "isInvestmentTransaction" | "billId" | "incomeId">;

/**
 * Records tied to another one only from the other side: a bill payment's
 * expense (`transactionId` on the payment, for expenses older than `billId`),
 * and a covered debt's expense (`coveredExpenseId`, or matched the way the
 * refund matches an older debt). Worked out from lists the app already holds.
 */
export function linkedRecordIds(
  bills: readonly { payments?: readonly { transactionId?: string }[] }[],
  debts: readonly CoveredDebt[],
  transactions: readonly Transaction[],
): Set<string> {
  const ids = new Set<string>();
  for (const bill of bills) for (const p of bill.payments ?? []) if (p.transactionId) ids.add(p.transactionId);
  for (const debt of debts) if (debt.coveredExpenseId) ids.add(debt.coveredExpenseId);
  for (const id of coveredExpenses([...debts], [...transactions], () => undefined).values()) if (id) ids.add(id);
  return ids;
}

const NONE: ReadonlySet<string> = new Set();

/** True for a record whose description is a payee the user typed. `linked`: see `linkedRecordIds`. */
export const carriesPayee = (tx: PayeeRecord, linked: ReadonlySet<string> = NONE): boolean =>
  !!tx.description?.trim() && !tx.debtId && !tx.billId && !tx.incomeId && !linked.has(tx.id) && !isMoneyMove(tx) && !isTransfer(tx as Transaction);

export interface PayeeRow {
  /** As shown: the saved spelling, else the most recent one typed. */
  name: string;
  key: string;
  /** How many records carry it. */
  count: number;
  /** In the hand-kept list the picker offers. */
  saved: boolean;
}

const time = (value: PayeeRecord["date"]): number => {
  const v = value as unknown;
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate().getTime();
  return new Date(v as string).getTime() || 0;
};

/** Every payee, saved or only used, with its count. Sorted as a phone's contacts are. */
export function payeeRows(saved: readonly string[], transactions: readonly PayeeRecord[], linked: ReadonlySet<string> = NONE): PayeeRow[] {
  const rows = new Map<string, PayeeRow & { last: number }>();
  for (const name of saved) {
    const key = nameKey(name);
    if (key && !rows.has(key)) rows.set(key, { name: cleanLine(name), key, count: 0, saved: true, last: -Infinity });
  }
  for (const tx of transactions) {
    if (!carriesPayee(tx, linked)) continue;
    const key = nameKey(tx.description);
    const at = time(tx.date);
    const row = rows.get(key);
    if (!row) rows.set(key, { name: cleanLine(tx.description), key, count: 1, saved: false, last: at });
    else {
      row.count += 1;
      if (!row.saved && at >= row.last) {
        row.last = at;
        row.name = cleanLine(tx.description);
      }
    }
  }
  return [...rows.values()].map(({ name, key, count, saved }) => ({ name, key, count, saved })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * The records a rename of `from` to `to` writes: each one carrying `from` (by
 * key), except those already spelled exactly `to` — nothing would change. The
 * count the confirmation states is this list's length, and so is the number
 * of documents written.
 */
export function payeeRenameIds(transactions: readonly PayeeRecord[], from: string, to: string, linked: ReadonlySet<string> = NONE): string[] {
  const fromKey = nameKey(from);
  const label = cleanLine(to);
  if (!fromKey || !label) return [];
  return transactions.filter((tx) => carriesPayee(tx, linked) && nameKey(tx.description) === fromKey && cleanLine(tx.description) !== label).map((tx) => tx.id);
}

/**
 * The saved list after `from` becomes `to`: `from` goes, and `to` takes its
 * place unless it is there already (a merge). A name never saved stays
 * unsaved. Returns the same array when nothing changes, so no write is made.
 */
export function savedAfterRename(saved: readonly string[], from: string, to: string): string[] {
  const fromKey = nameKey(from);
  const label = cleanLine(to);
  const at = saved.findIndex((p) => nameKey(p) === fromKey);
  if (at === -1 || !label) return saved as string[];
  const toKey = nameKey(label);
  const hasTo = saved.some((p, i) => i !== at && nameKey(p) === toKey);
  const next = saved.flatMap((p, i) => (i === at ? (hasTo ? [] : [label]) : nameKey(p) === fromKey ? [] : [p]));
  return next.length === saved.length && next.every((p, i) => p === saved[i]) ? (saved as string[]) : next;
}
