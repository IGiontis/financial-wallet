import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getUser, updateUser } from "../../../firebase/firestore";
import { exchangeRateKeys } from "../../../shared/hooks/useCurrencyConverter";
import { addPayee, removePayee, renamePayee, sortPayees } from "../payeeStore";
import type { User } from "../../../shared/types/IndexTypes";

/**
 * The user's hand-kept payee list, with the three edits the manage dialog needs.
 *
 * Stored as an array on the user document rather than in its own collection: a
 * list this size fits comfortably in one field, the document is already fetched
 * by the currency converter, and sharing that query key means the picker adds
 * no Firestore reads at all — only one write per edit.
 */
export function usePayees(): {
  payees: string[];
  /** False until the stored list is known, so an edit can't overwrite nothing. */
  isReady: boolean;
  add: (name: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  const { data: userData } = useQuery({
    queryKey: exchangeRateKeys.user(userId),
    queryFn: () => getUser(userId),
    enabled: !!userId,
    staleTime: 1000 * 60 * 30,
  });

  const payees = useMemo(() => sortPayees(userData?.savedPayees ?? []), [userData?.savedPayees]);

  // Every edit is the same shape: compute the next list, show it immediately,
  // persist, and put the old list back if the write fails.
  const commit = useCallback(
    async (next: string[], previous: string[]) => {
      if (!userId || next === previous) return;

      queryClient.setQueryData<User | null>(exchangeRateKeys.user(userId), (old) => (old ? { ...old, savedPayees: next } : old));

      try {
        await updateUser(userId, { savedPayees: next });
      } catch {
        queryClient.setQueryData<User | null>(exchangeRateKeys.user(userId), (old) => (old ? { ...old, savedPayees: previous } : old));
        throw new Error("payee-save-failed");
      }
    },
    [userId, queryClient],
  );

  // The stored order is preserved for writes; only the display list is sorted.
  const stored = useMemo(() => userData?.savedPayees ?? [], [userData?.savedPayees]);

  const add = useCallback((name: string) => commit(addPayee(stored, name), stored), [commit, stored]);
  const rename = useCallback((from: string, to: string) => commit(renamePayee(stored, from, to), stored), [commit, stored]);
  const remove = useCallback((name: string) => commit(removePayee(stored, name), stored), [commit, stored]);

  return { payees, isReady: !!userData, add, rename, remove };
}
