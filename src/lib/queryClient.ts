import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // No global staleTime — let each query decide
      staleTime: 0,

      // How long inactive data stays in cache (10 minutes)
      gcTime: 1000 * 60 * 10,

      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch when window regains focus
      refetchOnWindowFocus: true,

      // Always refetch when component mounts if data is stale
      refetchOnMount: true,

      // Refetch when network reconnects
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
