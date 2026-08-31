import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories, createCategory, updateCategory, deleteCategory, countCategoryUsage, createCategories, updateCategories, deleteCategories } from "../../../firebase/firestore";
import type { Transaction, Category, CreateTransactionDTO, UpdateTransactionDTO, CreateCategoryDTO, UpdateCategoryDTO } from "../../../shared/types/IndexTypes";
import { scopeTypes, type CategoryScope } from "../../../shared/utils/categoryNames";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const transactionKeys = {
  all: (userId: string) => ["transactions", userId] as const,
  categories: (userId: string) => ["categories", userId] as const,
};

// ─── useTransactions ──────────────────────────────────────────────────────────

export function useTransactions() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<Transaction[]>({
    queryKey: transactionKeys.all(userId),
    enabled: !!userId,
    queryFn: () => getTransactions(userId),
  });
}

// ─── useCategories ────────────────────────────────────────────────────────────

export function useCategories() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<Category[]>({
    queryKey: transactionKeys.categories(userId),
    enabled: !!userId,
    queryFn: () => getCategories(userId),
    staleTime: 1000 * 60 * 10,
  });
}

// ─── useCreateTransaction ─────────────────────────────────────────────────────

export function useCreateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (data: CreateTransactionDTO) => createTransaction(userId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}

// ─── useUpdateTransaction ─────────────────────────────────────────────────────

export function useUpdateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ transactionId, data }: { transactionId: string; data: UpdateTransactionDTO }) => updateTransaction(transactionId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}

// ─── useDeleteTransaction ─────────────────────────────────────────────────────

export function useDeleteTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (transactionId: string) => deleteTransaction(transactionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}
// ─── Category mutations ───────────────────────────────────────────────────────
// The seeded categories cover the common cases and nothing else — there is no
// "Δόσεις αυτοκινήτου" in a fixed list, and there never could be. These let the
// user fill the gaps themselves. Only their own categories are touched; the
// shared defaults carry `userId: null` and are never editable.

export function useCreateCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (data: CreateCategoryDTO) => createCategory(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
  });
}

export function useUpdateCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ categoryId, data }: { categoryId: string; data: UpdateCategoryDTO }) => updateCategory(categoryId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
  });
}

/**
 * Also invalidates transactions and bills: a category rename or removal changes
 * what every row referencing it displays.
 */
export function useDeleteCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(categoryId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: ["bills", userId] }),
      ]);
    },
  });
}

/** Counts what still points at a category, so deletion can refuse rather than orphan. */
export function useCategoryUsage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useMutation({ mutationFn: (categoryId: string) => countCategoryUsage(userId, categoryId) });
}
/**
 * Creates a category under one type or both at once, returning the new ids
 * keyed by type so an inline caller can select the half its form is recording.
 */
export function useCreateCategoryScope() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ name, icon, scope, defaultPayee, defaultAmount }: { name: string; icon?: string; scope: CategoryScope; defaultPayee?: string; defaultAmount?: number }) =>
      createCategories(userId, { name, icon, defaultPayee, defaultAmount }, scopeTypes(scope)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
  });
}

/** Renames or restyles every document behind one listed category. */
export function useUpdateCategoryGroup() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ categoryIds, data }: { categoryIds: string[]; data: UpdateCategoryDTO }) => updateCategories(categoryIds, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
  });
}

/** Deletes a whole group — both halves of a "both", never one of them. */
export function useDeleteCategoryGroup() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (categoryIds: string[]) => deleteCategories(categoryIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: ["bills", userId] }),
      ]);
    },
  });
}

/** Usage across every document behind a listed category. */
export function useCategoryGroupUsage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: async (categoryIds: string[]) => {
      const counts = await Promise.all(categoryIds.map((id) => countCategoryUsage(userId, id)));
      return counts.reduce((a, b) => a + b, 0);
    },
  });
}
