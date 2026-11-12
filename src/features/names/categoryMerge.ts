import type { TransactionType } from "../../shared/types/IndexTypes";
import type { CategoryUsage } from "../categories/categoryUsage";

// ─── Merging one category into another ───────────────────────────────────────
//
// Two categories that are one («Kafes» and «Καφές»): every record filed under
// the one that goes is moved to the one that stays, then the one that goes is
// deleted. The same four kinds of record the delete guard counts
// (`categoryUsage`) — transactions, bills, incomes, Planner lines — so after a
// merge nothing points at the deleted category, and the guard would have let
// it go.
//
// A category is one document per side: a «both» is two. Each document that
// goes is matched to the one of the SAME side that stays, so an expense is
// never refiled as income. When the one that stays lacks a side the other has,
// there is nowhere to move those records and the merge is not offered.

export interface MergeMember {
  id: string;
  type: TransactionType;
  isDefault?: boolean;
}

/**
 * dropped id → kept id, side by side. Null when it cannot be done: the one
 * that goes is a built-in category (shared, never deleted), the two are one,
 * or the one that stays lacks a side the other has.
 */
export function mergeTargets(drop: readonly MergeMember[], keep: readonly MergeMember[]): Record<string, string> | null {
  if (drop.length === 0 || keep.length === 0 || drop.some((d) => d.isDefault)) return null;
  if (drop.some((d) => keep.some((k) => k.id === d.id))) return null;
  const pairs: Record<string, string> = {};
  for (const member of drop) {
    const target = keep.find((k) => k.type === member.type);
    if (!target) return null;
    pairs[member.id] = target.id;
  }
  return pairs;
}

/** One listed category's identity: its documents' ids. */
export const groupKey = (group: { members: readonly { id: string }[] }) => group.members.map((m) => m.id).join("-");

export interface MergeSources<Tx extends { id: string; categoryId?: string | null } = { id: string; categoryId?: string | null }, Bill extends { id: string; categoryId?: string | null } = { id: string; categoryId?: string | null }> {
  transactions: readonly Tx[];
  bills: readonly Bill[];
  /** The incomes list as stored on the user document. */
  incomes: readonly unknown[];
  /** The Planner's lines as stored on the user document. */
  plannerLines: readonly unknown[];
}

export interface RecordMove {
  id: string;
  /** The category it moves to. */
  to: string;
}

export interface CategoryMergePlan {
  pairs: Record<string, string>;
  /** Documents to write, each known to exist (they come from the lists held), with the category each moves to. */
  transactions: RecordMove[];
  bills: RecordMove[];
  /** The stored lists rewritten, or null when nothing in them moves. */
  incomes: unknown[] | null;
  plannerLines: unknown[] | null;
  /** How many of each kind move — what the confirmation states. */
  moves: CategoryUsage;
  /** The documents deleted once everything has moved. */
  deleteIds: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Everything a merge writes, worked out from what the app already holds. */
export function planCategoryMerge<Tx extends { id: string; categoryId?: string | null }, Bill extends { id: string; categoryId?: string | null }>(
  pairs: Record<string, string>,
  sources: MergeSources<Tx, Bill>,
): CategoryMergePlan {
  const moves = (id: unknown) => typeof id === "string" && id in pairs;

  const transactions = sources.transactions.filter((tx) => moves(tx.categoryId)).map((tx) => ({ id: tx.id, to: pairs[tx.categoryId as string] }));
  const bills = sources.bills.filter((bill) => moves(bill.categoryId)).map((bill) => ({ id: bill.id, to: pairs[bill.categoryId as string] }));

  let incomeMoves = 0;
  const incomes = sources.incomes.map((income) => {
    if (!isRecord(income) || !moves(income.categoryId)) return income;
    incomeMoves += 1;
    return { ...income, categoryId: pairs[income.categoryId as string] };
  });

  let lineMoves = 0;
  const plannerLines = sources.plannerLines.map((line) => {
    if (!isRecord(line) || !Array.isArray(line.categoryIds) || !line.categoryIds.some(moves)) return line;
    lineMoves += 1;
    // A line that already names the one kept names it once.
    const ids = [...new Set(line.categoryIds.map((id) => (moves(id) ? pairs[id as string] : id)))];
    return { ...line, categoryIds: ids };
  });

  return {
    pairs,
    transactions,
    bills,
    incomes: incomeMoves > 0 ? incomes : null,
    plannerLines: lineMoves > 0 ? plannerLines : null,
    moves: { transactions: transactions.length, bills: bills.length, incomes: incomeMoves, plannerLines: lineMoves },
    deleteIds: Object.keys(pairs),
  };
}

/** Records moved by a plan, apart from the category documents deleted. */
export const movedCount = (plan: CategoryMergePlan): number => plan.moves.transactions + plan.moves.bills + plan.moves.incomes + plan.moves.plannerLines;
