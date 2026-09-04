import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { firestoreToDate } from "../../../shared/utils/dates";
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

// ─── Writing ──────────────────────────────────────────────────────────────────
// Every one of these used to `await queryClient.invalidateQueries(...)` inside
// `onSuccess`, which keeps the mutation pending until the *entire* transaction
// list has been fetched back from Firestore. The modal waits on that promise,
// so saving a transaction took as long as re-downloading everything — seconds
// on a slow connection, and on a stalled one it never visibly finished at all
// even though the write had long since landed.
//
// Now the cache is corrected immediately and the refetch happens behind it: the
// row is on screen before the network has finished, and reconciles when the
// server's own copy arrives.

const byNewestFirst = (rows: Transaction[]) => [...rows].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());

/** Rolls the list back to what it was if the write turns out to have failed. */
interface Rollback {
  previous?: Transaction[];
}

export function useCreateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);

  return useMutation<string, Error, CreateTransactionDTO, Rollback>({
    mutationFn: (data: CreateTransactionDTO) => createTransaction(userId, data),

    onMutate: async (data) => {
      // An in-flight fetch would otherwise land on top of the optimistic row
      // and blink it away again.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transaction[]>(key);

      // A stand-in id until the real document comes back; nothing keys off it.
      const optimistic = { ...data, id: `temp-${Date.now()}`, userId, createdAt: new Date(), updatedAt: new Date() } as Transaction;
      queryClient.setQueryData<Transaction[]>(key, (rows) => byNewestFirst([...(rows ?? []), optimistic]));

      return { previous };
    },

    onError: (_err, _data, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    // Deliberately not awaited: the caller is finished, and the refetch is a
    // correction rather than something to wait on.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);

  return useMutation<void, Error, { transactionId: string; data: UpdateTransactionDTO }, Rollback>({
    mutationFn: ({ transactionId, data }) => updateTransaction(transactionId, data),

    onMutate: async ({ transactionId, data }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transaction[]>(key);

      queryClient.setQueryData<Transaction[]>(key, (rows) =>
        byNewestFirst((rows ?? []).map((row) => (row.id === transactionId ? ({ ...row, ...data, updatedAt: new Date() } as Transaction) : row))),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);

  return useMutation<void, Error, string, Rollback>({
    mutationFn: (transactionId: string) => deleteTransaction(transactionId),

    onMutate: async (transactionId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transaction[]>(key);

      queryClient.setQueryData<Transaction[]>(key, (rows) => (rows ?? []).filter((row) => row.id !== transactionId));

      return { previous };
    },

    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
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
