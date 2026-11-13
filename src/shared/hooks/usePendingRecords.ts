import { useCallback, useMemo, useSyncExternalStore } from "react";
import { pendingKindOf, pendingVersion, subscribePending } from "../utils/pendingRecords";

/** The class a pending row or card wears (styles/theme.css): faded, and nothing on it can be pressed. */
export const ROW_PENDING = "row-pending";

/**
 * Which records on this screen have a write in flight — see `pendingRecords`.
 *
 *   const { busy, pendingClass } = usePendingRecords();
 *   <tr className={pendingClass("bills", bill.id)} aria-busy={busy("bills", bill.id) || undefined}>
 *   <RowMenu disabled={busy("bills", bill.id)} … />
 *
 * `busy` — an online-only action (a delete, a merge) is running on it: its row
 * and its actions are disabled everywhere it shows. `writing` — any write at
 * all, a save not yet acknowledged included: what the Overview's clickable
 * items check (the owner, 2026-11-13).
 */
export function usePendingRecords() {
  const version = useSyncExternalStore(subscribePending, pendingVersion, pendingVersion);
  const busy = useCallback(
    (collection: string, id: string | undefined) => !!id && pendingKindOf(collection, id) === "action",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new function whenever the store changes
    [version],
  );
  const writing = useCallback(
    (collection: string, id: string | undefined) => !!id && pendingKindOf(collection, id) !== undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new function whenever the store changes
    [version],
  );
  return useMemo(
    () => ({
      busy,
      writing,
      /** `ROW_PENDING` while an online-only action runs on the record, "" otherwise. */
      pendingClass: (collection: string, id: string | undefined) => (busy(collection, id) ? ROW_PENDING : ""),
    }),
    [busy, writing],
  );
}
