import { useCallback, useContext, useSyncExternalStore } from "react";
import { QueryClientContext, type QueryKey } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { workspaceKeys } from "./useWorkspaceSetting";

/**
 * What the app already holds under `queryKey`, without ever fetching it: for a
 * form that checks a typed name against the names there (`matchName`). The
 * screen that opened the form has loaded the list; if not, there is nothing to
 * compare with, and nothing is read to find out — zero reads, always. Follows
 * the cache as it changes. Outside a query provider (a form rendered on its
 * own) there is simply nothing held.
 */
export function useCachedData<T>(queryKey: QueryKey): T | undefined {
  const client = useContext(QueryClientContext);
  const hash = JSON.stringify(queryKey);
  const subscribe = useCallback((onChange: () => void) => (client ? client.getQueryCache().subscribe(onChange) : () => {}), [client]);
  // The cache hands back the same object until the data changes, as the store needs.
  const read = useCallback(() => client?.getQueryData<T>(JSON.parse(hash) as QueryKey), [client, hash]);
  return useSyncExternalStore(subscribe, read, read);
}

const NOTHING: never[] = [];

/** A cached list (`useCachedData`), empty when none is held. */
export function useCachedList<T>(queryKey: QueryKey): T[] {
  return useCachedData<T[]>(queryKey) ?? (NOTHING as T[]);
}

/** One key of the user document's workspace as held (`useWorkspaceSetting`), without a read. */
export function useCachedWorkspaceList<T>(key: string): T[] {
  const { currentUser } = useAuth();
  const workspace = useCachedData<Record<string, unknown>>(workspaceKeys.all(currentUser?.uid ?? ""));
  const value = workspace?.[key];
  return Array.isArray(value) ? (value as T[]) : (NOTHING as T[]);
}
