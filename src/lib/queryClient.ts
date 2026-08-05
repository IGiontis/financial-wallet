import { QueryClient } from "@tanstack/react-query";

// Firestore bills per document read, and this app runs on the free tier. The
// defaults below are tuned to cut reads rather than to keep data maximally
// fresh: every mutation already invalidates the queries it affects, so the only
// thing a refetch can pick up is a change made on *another* device.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 5 minutes. Navigating between pages inside that
      // window reuses the cache instead of re-reading the whole collection.
      staleTime: 1000 * 60 * 5,

      // How long inactive data stays in cache (30 minutes)
      gcTime: 1000 * 60 * 30,

      // Retrying a genuinely failing query (bad rules, offline) just multiplies
      // the read count, so keep it to a single retry.
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Alt-tabbing used to re-read every collection. Reconnect + mount (when
      // stale) are enough to keep things current.
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
