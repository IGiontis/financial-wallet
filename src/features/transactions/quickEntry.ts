import { firestoreToDate } from "../../shared/utils/dates";
import type { Transaction } from "../../shared/types/IndexTypes";

/** One of «τα συνηθισμένα σου»: something bought again and again, ready to put in with a tap. */
export interface QuickFavorite {
  /** The description and the category it went under, together. */
  key: string;
  /** The description, as it was last written. */
  label: string;
  categoryId: string;
  /** The card it went through last time; absent for the main account. */
  accountId?: string;
  /**
   * The amount, only when it has been the same the last three times — the
   * coffee at 3,50. Otherwise none: an amount the reader did not see or type is
   * never saved, and the supermarket is different every week.
   */
  fixedAmount?: number;
  /** What it came to last time, to show as a hint where there is no fixed amount. */
  lastAmount: number;
  count: number;
}

/** How far back it looks for what is bought often. */
const WINDOW_DAYS = 120;
/** Times it must have been bought to count as usual. */
const MIN_COUNT = 2;
/** The same amount this many times running makes it fixed. */
const FIXED_RUN = 3;

/**
 * An expense the reader wrote down themselves — not one the app wrote for
 * them: a bill paid, a loan's money, a transfer's half, a goal's deposit.
 */
export const isManualExpense = (tx: Transaction): boolean =>
  tx.type === "expense" && !tx.billId && !tx.debtId && !tx.transferId && !tx.isGoalTransaction && !tx.isInvestmentTransaction && !tx.recurringTransactionId;

const newestFirst = (a: Transaction, b: Transaction) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime();

/**
 * «Τα συνηθισμένα σου»: what the reader has bought at least twice in the last
 * four months, by description and category, the most often first. Read from
 * the transactions already loaded — no reads.
 */
export function quickFavorites(transactions: Transaction[], now: Date = new Date(), limit = 6): QuickFavorite[] {
  const since = now.getTime() - WINDOW_DAYS * 86_400_000;
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!isManualExpense(tx) || !tx.description?.trim() || firestoreToDate(tx.date).getTime() < since) continue;
    const key = `${tx.description.trim().toLowerCase()}|${tx.categoryId}`;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  // Each group newest first; the groups the most often first, then the most recent.
  return [...groups.entries()]
    .filter(([, list]) => list.length >= MIN_COUNT)
    .map(([key, list]) => ({ key, sorted: [...list].sort(newestFirst) }))
    .sort((a, b) => b.sorted.length - a.sorted.length || newestFirst(a.sorted[0], b.sorted[0]))
    .slice(0, limit)
    .map(({ key, sorted }): QuickFavorite => {
      const last = sorted[0];
      const run = sorted.slice(0, FIXED_RUN);
      const fixed = run.length === FIXED_RUN && run.every((tx) => Math.abs(tx.amount - last.amount) < 0.005);
      return {
        key,
        label: last.description.trim(),
        categoryId: last.categoryId,
        accountId: last.accountId,
        fixedAmount: fixed ? last.amount : undefined,
        lastAmount: last.amount,
        count: sorted.length,
      };
    });
}

/** The expense categories used most recently, each once, the latest first. */
export function recentCategoryIds(transactions: Transaction[], limit = 6): string[] {
  const ids: string[] = [];
  for (const tx of [...transactions].filter(isManualExpense).sort(newestFirst)) {
    if (!ids.includes(tx.categoryId)) ids.push(tx.categoryId);
    if (ids.length === limit) break;
  }
  return ids;
}

/** The card a category's expenses went through last; undefined for the main account or none yet. */
export function lastAccountFor(transactions: Transaction[], categoryId: string): string | undefined {
  return [...transactions].filter((tx) => isManualExpense(tx) && tx.categoryId === categoryId).sort(newestFirst)[0]?.accountId;
}
