import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query Client Configuration
 *
 * 2025/2026 Best Practices:
 * - Aggressive caching for better UX
 * - Retry failed requests
 * - Refetch on window focus (fresh data)
 * - Type-safe queries
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // How long data stays fresh before refetching (5 minutes)
      staleTime: 1000 * 60 * 5,

      // How long inactive data stays in cache (10 minutes)
      gcTime: 1000 * 60 * 10,

      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch when window regains focus (user comes back to tab)
      refetchOnWindowFocus: true,

      // Don't refetch on component mount if data is still fresh
      refetchOnMount: false,

      // Refetch when network reconnects
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});
