import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { firestoreToDate } from "../../../shared/utils/dates";
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  countCategoryUsage,
  createCategories,
  updateCategories,
  deleteCategories,
  newDocId,
  type BillPaymentLink,
} from "../../../firebase/firestore";
import type { Transaction, Category, CreateTransactionDTO, UpdateTransactionDTO, CreateCategoryDTO, UpdateCategoryDTO, BillWithStatus } from "../../../shared/types/IndexTypes";
import { scopeTypes, type CategoryScope } from "../../../shared/utils/categoryNames";
import { confirmList, editList, idsFor, removeWhere, restoreList, upsertById, withoutUndefined, type ListEdit, type ListSnapshot } from "../../../lib/listCache";
import { billKeys, editPayments, paymentIdFor } from "../../bills/billCache";

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
// `onSuccess`, which kept the mutation pending until the *entire* transaction
// list had been fetched back from Firestore. That became "correct the cache at
// once, refetch behind it" — and now the refetch is gone too, because on the
// free tier it was the expensive half of every save: see `listCache`. The row
// is on screen before the network has finished, under the id it will keep, and
// once the write lands the list is only marked stale, so the server's own copy
// arrives with the next natural refresh.

const byNewestFirst = (rows: Transaction[]) => [...rows].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());

/**
 * Adds a row, or replaces the one with its id, keeping the list newest first.
 * Also used for the expenses and deposits other screens mirror into this list.
 */
export const insertTransaction =
  (row: Transaction): ListEdit<Transaction> =>
  (rows) =>
    byNewestFirst(upsertById(row)(rows));

/** Sets a few fields on one row — for a mirror corrected from the screen that owns it. */
export const setTransactionFields =
  (transactionId: string, fields: Partial<Transaction>): ListEdit<Transaction> =>
  (rows) =>
    byNewestFirst(rows.map((row) => (row.id === transactionId ? { ...row, ...withoutUndefined(fields), updatedAt: new Date() } : row)));

/**
 * What `updateTransaction` leaves in the document, applied to the cached row.
 *
 * It has to match the write exactly now that no refetch follows to correct it:
 * `metadata` left out of an edit is *removed* (the form sends it whenever there
 * is any), and `accountId: null` removes the account rather than storing null.
 */
export function applyTransactionUpdate(row: Transaction, data: UpdateTransactionDTO): Transaction {
  const next: Record<string, unknown> = { ...row, ...withoutUndefined(data), updatedAt: new Date() };
  if (data.metadata === undefined) delete next.metadata;
  if (data.accountId === null) delete next.accountId;
  return next as unknown as Transaction;
}

const mergeTransaction =
  (transactionId: string, data: UpdateTransactionDTO): ListEdit<Transaction> =>
  (rows) =>
    byNewestFirst(rows.map((row) => (row.id === transactionId ? applyTransactionUpdate(row, data) : row)));

/** A bill's payment holds the same amount and day as its expense — see `BillPaymentLink`. */
const syncPayment = (transactionId: string, data: UpdateTransactionDTO) =>
  editPayments((payments) =>
    payments.map((p) =>
      p.transactionId === transactionId ? { ...p, ...(data.amount !== undefined && { amount: data.amount }), ...(data.date !== undefined && { paidDate: data.date }) } : p,
    ),
  );

/** One id per save, shared by the optimistic row and the write — see `idsFor`. */
const createdIds = new WeakMap<CreateTransactionDTO, string>();

interface CreateContext {
  row: Transaction;
  transactions: ListSnapshot<Transaction>;
}

export function useCreateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);
  const idFor = (data: CreateTransactionDTO) => idsFor(createdIds, data, () => newDocId("transactions"));

  return useMutation<string, Error, CreateTransactionDTO, CreateContext>({
    mutationFn: (data: CreateTransactionDTO) => createTransaction(userId, data, idFor(data)),

    onMutate: async (data) => {
      // Shaped like the document the write produces. The timestamps are this
      // device's clock until the server's copy arrives with the next refresh;
      // every reader goes through `firestoreToDate`, which takes either.
      const now = new Date();
      const row = { ...withoutUndefined(data), id: idFor(data), userId, createdAt: now, updatedAt: now } as Transaction;
      return { row, transactions: await editList(queryClient, key, insertTransaction(row)) };
    },

    onError: (_err, _data, context) => restoreList(queryClient, context?.transactions),

    onSuccess: (_id, _data, context) => {
      if (context) confirmList(queryClient, key, insertTransaction(context.row));
    },
  });
}

interface UpdateContext {
  transactions: ListSnapshot<Transaction>;
  bills?: ListSnapshot<BillWithStatus>;
}

export function useUpdateTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);

  /** Set when the row is a bill's expense: its payment is corrected with it. */
  const billLinkFor = (transactionId: string): BillPaymentLink | undefined => {
    const row = queryClient.getQueryData<Transaction[]>(key)?.find((r) => r.id === transactionId);
    return row?.billId ? { userId, paymentId: paymentIdFor(queryClient, userId, transactionId) } : undefined;
  };

  return useMutation<void, Error, { transactionId: string; data: UpdateTransactionDTO }, UpdateContext>({
    mutationFn: ({ transactionId, data }) => updateTransaction(transactionId, data, billLinkFor(transactionId)),

    onMutate: async ({ transactionId, data }) => {
      const isBillExpense = !!billLinkFor(transactionId);
      return {
        transactions: await editList(queryClient, key, mergeTransaction(transactionId, data)),
        bills: isBillExpense ? await editList(queryClient, billKeys.all(userId), syncPayment(transactionId, data)) : undefined,
      };
    },

    onError: (_err, _vars, context) => {
      restoreList(queryClient, context?.transactions);
      restoreList(queryClient, context?.bills);
    },

    onSuccess: (_void, { transactionId, data }, context) => {
      confirmList(queryClient, key, mergeTransaction(transactionId, data));
      if (context?.bills) confirmList(queryClient, billKeys.all(userId), syncPayment(transactionId, data));
    },
  });
}

/** What deleting needs to know about a row: its id, and whether a bill's payment goes with it. */
export type DeletableTransaction = Pick<Transaction, "id" | "billId">;

export function useDeleteTransaction() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);

  return useMutation<void, Error, DeletableTransaction, { transactions: ListSnapshot<Transaction> }>({
    // The payment is looked up in the bills list, which this mutation edits
    // only after the delete has gone through — so it is still there to find.
    mutationFn: ({ id, billId }) => deleteTransaction(id, billId ? { userId, paymentId: paymentIdFor(queryClient, userId, id) } : undefined),

    onMutate: async ({ id }) => ({ transactions: await editList(queryClient, key, removeWhere<Transaction>((row) => row.id === id)) }),

    onError: (_err, _tx, context) => restoreList(queryClient, context?.transactions),

    onSuccess: (_void, { id, billId }) => {
      confirmList(queryClient, key, removeWhere<Transaction>((row) => row.id === id));
      // Deletes wait for a connection, so the bill turns unpaid with the
      // server's answer a moment after the row has gone.
      if (billId) confirmList(queryClient, billKeys.all(userId), editPayments((payments) => payments.filter((p) => p.transactionId !== id)));
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
 * Takes the deleted categories out of the cached list.
 *
 * Transactions and bills used to be re-read here as well, on the idea that the
 * rows referencing a category change with it. Nothing references a category
 * being deleted — the screen refuses while `countCategoryUsage` finds any — and
 * a row shows its category by looking it up in this list, not from a copy of
 * its own, so those two re-reads fetched every transaction and bill to change
 * nothing.
 */
const dropCategories = (queryClient: QueryClient, userId: string, categoryIds: string[]) =>
  confirmList(queryClient, transactionKeys.categories(userId), removeWhere<Category>((c) => categoryIds.includes(c.id)));

export function useDeleteCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(categoryId),
    onSuccess: (_void, categoryId) => dropCategories(queryClient, userId, [categoryId]),
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
    onSuccess: (_void, categoryIds) => dropCategories(queryClient, userId, categoryIds),
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
