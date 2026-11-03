// ─── What still uses a category ──────────────────────────────────────────────
//
// Before one of the user's own categories may go, every record that points at
// it is counted, by kind, so the dialog can say where they are rather than
// only how many. Counted from what the app already holds — the transactions
// list (delta-synced, complete), the bills, and the incomes and Planner lines
// that sit on the user document — so asking costs no read.
//
// Quick-entry favourites are not a kind of their own: they are worked out from
// the transactions, so a category with none has none. The old `budgets`
// collection is no longer read anywhere and holds no category references the
// app shows.

export interface CategoryUsage {
  transactions: number;
  bills: number;
  incomes: number;
  plannerLines: number;
}

export interface CategoryUsageSources {
  transactions: ReadonlyArray<{ categoryId?: string | null }>;
  bills: ReadonlyArray<{ categoryId?: string | null }>;
  incomes: ReadonlyArray<{ categoryId?: string | null }>;
  plannerLines: ReadonlyArray<{ categoryIds?: readonly string[] | null }>;
}

/**
 * How many of each kind of record use any of `categoryIds` — both documents of
 * a «both» pair at once. A Planner line that names two of them counts once.
 */
export function categoryUsage(categoryIds: readonly string[], sources: CategoryUsageSources): CategoryUsage {
  const ids = new Set(categoryIds);
  const uses = (id: string | null | undefined) => !!id && ids.has(id);
  return {
    transactions: sources.transactions.filter((tx) => uses(tx.categoryId)).length,
    bills: sources.bills.filter((bill) => uses(bill.categoryId)).length,
    incomes: sources.incomes.filter((income) => uses(income.categoryId)).length,
    plannerLines: sources.plannerLines.filter((line) => (line.categoryIds ?? []).some(uses)).length,
  };
}

/** Everything counted together: zero means it can go. */
export const totalUsage = (usage: CategoryUsage): number => usage.transactions + usage.bills + usage.incomes + usage.plannerLines;
