import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories } from "../../../firebase/firestore";
import type { Transaction, Category, CreateTransactionDTO, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";

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
    staleTime: 1000 * 60 * 10, // categories change rarely — cache 10 min
  });
}

// ─── useCreateTransaction ─────────────────────────────────────────────────────

export function useCreateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (data: CreateTransactionDTO) => createTransaction(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}
