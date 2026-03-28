import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "../services/mockDataServices";
import type { User } from "../types/IndexTypes";

/**
 * Hook to fetch current authenticated user
 * Standalone version - no external query key dependencies
 */
export function useUser() {
  return useQuery<User | null, Error>({
    queryKey: ["user", "current"], // Inline query key - simple array
    queryFn: getCurrentUser,
    // User data rarely changes, keep it fresh for longer
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
