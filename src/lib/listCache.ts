import type { QueryClient, QueryKey } from "@tanstack/react-query";

// ─── Editing a cached list instead of re-reading it ──────────────────────────
//
// Every save used to finish with `invalidateQueries`, which fetches the whole
// list again. On the free tier that is the expensive part of a save, not the
// write: Firestore only bills the changes when the same query ran in the last
// thirty minutes, and bills every document again when it did not. Resume the
// app after lunch, add a coffee, and the refetch behind it read all ~1,500
// transactions to show one new row the screen already had.
//
// So the cache is edited to match the write, and the edited list counts as
// fresh. Marking it stale instead would only have moved the cost: the next
// screen to mount the list — usually the very next tap after a save — would
// read it all again. It is fetched when it goes stale in the usual way, five
// minutes on, which is also when another device's changes appear, exactly as
// they do today when nothing is saved.
//
// Every edit passed in here must be idempotent (upsert by id, remove by id,
// merge the same fields), because it is applied twice: once before the write,
// so the screen answers at once, and again after it, in case a fetch replaced
// the list in between.

export type ListEdit<T> = (rows: T[]) => T[];

/** A list as it was before an optimistic edit, kept so a failed write can put it back. */
export interface ListSnapshot<T> {
  queryKey: QueryKey;
  previous: T[] | undefined;
}

/**
 * Applies an edit before the write it describes has landed.
 *
 * A list that has never loaded is left alone. Writing the one new row into it
 * would create a list of one that looks loaded and fresh, and every screen
 * reading it would show that single row as the whole history until it went
 * stale — the first load has to come from the server.
 */
export async function editList<T>(queryClient: QueryClient, queryKey: QueryKey, edit: ListEdit<T>): Promise<ListSnapshot<T>> {
  if (queryClient.getQueryData<T[]>(queryKey) === undefined) return { queryKey, previous: undefined };

  // An in-flight fetch would otherwise land on top of the optimistic row and
  // blink it away again.
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<T[]>(queryKey);
  if (previous) queryClient.setQueryData<T[]>(queryKey, edit(previous));
  return { queryKey, previous };
}

/**
 * Puts a list back after a failed write.
 *
 * This is the one path that still asks the server. A failure is rare, and it
 * leaves the cache's picture in doubt: restoring the snapshot can also undo a
 * neighbouring save that succeeded in the meantime.
 */
export function restoreList<T>(queryClient: QueryClient, snapshot: ListSnapshot<T> | undefined): void {
  if (!snapshot) return;
  if (snapshot.previous) queryClient.setQueryData(snapshot.queryKey, snapshot.previous);
  void queryClient.invalidateQueries({ queryKey: snapshot.queryKey });
}

/**
 * After a write has landed: make sure the cache shows it, and leave it fresh.
 *
 * The list now holds what the server holds, bar the server's own timestamps,
 * so there is nothing to fetch — and a list marked stale here would be read in
 * full by whichever screen mounts it next.
 *
 * A list that was never loaded has nothing to patch. It is refetched only if a
 * screen is showing it right now (an in-flight first load is reused rather
 * than cancelled and paid for twice); otherwise the next screen to ask loads
 * it whole, as it would have anyway.
 */
export function confirmList<T>(queryClient: QueryClient, queryKey: QueryKey, edit: ListEdit<T>): void {
  if (queryClient.getQueryData<T[]>(queryKey) !== undefined) {
    queryClient.setQueryData<T[]>(queryKey, (rows) => (rows ? edit(rows) : rows));
    return;
  }
  void queryClient.invalidateQueries({ queryKey, refetchType: "active" }, { cancelRefetch: false });
}

// ─── Idempotent edits ─────────────────────────────────────────────────────────

/** Adds the row, or replaces the one with its id — never a second copy. */
export const upsertById =
  <T extends { id: string }>(row: T): ListEdit<T> =>
  (rows) =>
    rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];

/** Drops every row the predicate matches. */
export const removeWhere =
  <T>(match: (row: T) => boolean): ListEdit<T> =>
  (rows) =>
    rows.filter((row) => !match(row));

/**
 * Firestore drops undefined fields on write (`clean` in the data layer), so a
 * row built for the cache from the same DTO drops them too — otherwise the
 * cached row and the stored document would disagree about which keys exist.
 */
export const withoutUndefined = <T extends object>(obj: T): Partial<T> => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * The same document ids for the optimistic row and the write.
 *
 * `onMutate` and `mutationFn` are handed the very same variables object, so an
 * id minted for it in one is found again by the other — and by a retry of the
 * write, which then overwrites its own first attempt instead of adding a
 * duplicate the way a retried `addDoc` could.
 */
export function idsFor<V extends object, I>(store: WeakMap<V, I>, vars: V, make: () => I): I {
  let ids = store.get(vars);
  if (ids === undefined) {
    ids = make();
    store.set(vars, ids);
  }
  return ids;
}
