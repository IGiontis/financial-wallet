import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { router } from "./lib/router";

/**
 * App Component
 *
 * 2025/2026 Best Practice Pattern:
 * - Centralizes all providers in one place
 * - Keeps main.tsx minimal
 * - Makes testing easier (can test App without DOM)
 * - Clear separation of concerns
 * - Easy to add more providers (Redux, Theme, etc.)
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
