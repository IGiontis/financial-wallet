import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../../shared/hooks/useOnceMutation";
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
import type { Transaction, Category, CreateTransactionDTO, UpdateTransactionDTO, CreateCategoryDTO, UpdateCategoryDTO, BillWithStatus, TransactionType } from "../../../shared/types/IndexTypes";
import { scopeTypes, type CategoryScope } from "../../../shared/utils/categoryNames";
import { confirmList, editList, idsFor, mergeFields, removeWhere, restoreList, upsertById, withoutUndefined, type ListEdit, type ListSnapshot } from "../../../lib/listCache";
import { billKeys, editPayments, paymentIdFor } from "../../bills/billCache";
import { sameAsStored } from "../../../shared/utils/sameValues";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const transactionKeys = {
  all: (userId: string) => ["transactions", userId] as const,
  categories: (userId: string) => ["categories", userId] as const,
};

// ─── useTransactions ──────────────────────────────────────────────────────────

/**
 * Every transaction of the signed-in user.
 *
 * `fetch: false` only listens: it returns what the cache already holds — or
 * `undefined` — and never asks Firestore itself. For the menu's badges, which
 * are on every screen: a screen that shows money has loaded the list anyway,
 * and one that does not (Settings, Debts) should not pay for the whole
 * collection just to light a number in the menu.
 */
export function useTransactions({ fetch = true }: { fetch?: boolean } = {}) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<Transaction[]>({
    queryKey: transactionKeys.all(userId),
    enabled: !!userId && fetch,
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
  // undefined left as stored, `null` (a note or a card cleared) taken off — and
  // the fuel details always spoken for: none takes them off.
  return mergeFields(row, { ...data, metadata: data.metadata ?? null, updatedAt: new Date() });
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

  return useOnceMutation<string, Error, CreateTransactionDTO, CreateContext>({
    onceBy: sameCall,
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

  return useOnceMutation<void, Error, { transactionId: string; data: UpdateTransactionDTO }, UpdateContext>({
    onceBy: sameCall,
    // The row as stored already says all of it: nothing is written. Compared as
    // `updateTransaction` writes it: an undefined field is not written (left as
    // stored), but `metadata` always is — it is taken off when the edit has none.
    unchangedWhen: ({ transactionId, data }) =>
      sameAsStored(queryClient.getQueryData<Transaction[]>(key)?.find((r) => r.id === transactionId), { ...withoutUndefined(data), metadata: data.metadata }),
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

  return useOnceMutation<void, Error, DeletableTransaction, { transactions: ListSnapshot<Transaction> }>({
    // The payment is looked up in the bills list, which this mutation edits
    // only after the delete has gone through — so it is still there to find.
    onceBy: (tx) => tx.id,
    mutationFn: ({ id, billId }) => deleteTransaction(userId, id, billId ? { userId, paymentId: paymentIdFor(queryClient, userId, id) } : undefined),

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

  return useOnceMutation({
    onceBy: sameCall,
    mutationFn: (data: CreateCategoryDTO) => createCategory(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.categories(userId) }),
  });
}

export function useUpdateCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({
    onceBy: sameCall,
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

  return useOnceMutation({
    onceBy: (categoryId: string) => categoryId,
    mutationFn: (categoryId: string) => deleteCategory(userId, categoryId),
    onSuccess: (_void, categoryId) => dropCategories(queryClient, userId, [categoryId]),
  });
}

/** Counts what still points at a category, so deletion can refuse rather than orphan. */
export function useCategoryUsage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({ onceBy: (categoryId: string) => categoryId, mutationFn: (categoryId: string) => countCategoryUsage(userId, categoryId) });
}
/** The ids a new category will be saved under, one per type — made on the device, so the form can pick it at once. */
export type NewCategoryIds = Partial<Record<TransactionType, string>>;
export const newCategoryIds = (scope: CategoryScope): NewCategoryIds => Object.fromEntries(scopeTypes(scope).map((type) => [type, newDocId("categories")]));

export interface CreateCategoryScopeVars {
  name: string;
  icon?: string;
  scope: CategoryScope;
  /** From `newCategoryIds`, when the caller needs the new id before the server has answered. */
  ids?: NewCategoryIds;
}

/** One set of ids per save, shared by the rows put on screen and the write — see `idsFor`. */
const categoryIds = new WeakMap<CreateCategoryScopeVars, NewCategoryIds>();

/**
 * Creates a category under one type or both at once, returning the new ids
 * keyed by type so an inline caller can select the half its form is recording.
 * On the list at once (optimistic), as every new record is — the dialog never
 * waits for the server (`saveWithoutWaiting`); put back if the write is refused.
 */
export function useCreateCategoryScope() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.categories(userId);
  const idsOf = (vars: CreateCategoryScopeVars) => vars.ids ?? idsFor(categoryIds, vars, () => newCategoryIds(vars.scope));
  const rowsOf = (vars: CreateCategoryScopeVars): Category[] => {
    const now = new Date();
    const ids = idsOf(vars);
    return scopeTypes(vars.scope).flatMap((type) =>
      ids[type] ? [{ ...withoutUndefined({ name: vars.name, icon: vars.icon }), type, id: ids[type], userId, isDefault: false, createdAt: now, updatedAt: now } as unknown as Category] : [],
    );
  };
  const putRows = (rows: Category[]): ListEdit<Category> => (list) => rows.reduce((acc, row) => upsertById(row)(acc), list);

  return useOnceMutation<Record<string, string>, Error, CreateCategoryScopeVars, { rows: Category[]; categories: ListSnapshot<Category> }>({
    onceBy: sameCall,
    mutationFn: (vars) => createCategories(userId, { name: vars.name, icon: vars.icon }, scopeTypes(vars.scope), idsOf(vars)),
    onMutate: async (vars) => {
      const rows = rowsOf(vars);
      return { rows, categories: await editList(queryClient, key, putRows(rows)) };
    },
    onError: (_error, _vars, context) => restoreList(queryClient, context?.categories),
    onSuccess: (_ids, _vars, context) => {
      if (context) confirmList(queryClient, key, putRows(context.rows));
    },
  });
}

/** Renames or restyles every document behind one listed category — on screen at once, put back if refused. */
export function useUpdateCategoryGroup() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.categories(userId);
  const merge =
    (categoryIds: string[], data: UpdateCategoryDTO): ListEdit<Category> =>
    (rows) =>
      rows.map((row) => (categoryIds.includes(row.id) ? mergeFields(row, { ...data, updatedAt: new Date() }) : row));

  return useOnceMutation<void, Error, { categoryIds: string[]; data: UpdateCategoryDTO }, { categories: ListSnapshot<Category> }>({
    onceBy: sameCall,
    // Every document behind the category already says it: nothing is written.
    unchangedWhen: ({ categoryIds, data }) => {
      const rows = queryClient.getQueryData<Category[]>(key) ?? [];
      return categoryIds.length > 0 && categoryIds.every((id) => sameAsStored(rows.find((r) => r.id === id), withoutUndefined(data)));
    },
    mutationFn: ({ categoryIds, data }) => updateCategories(categoryIds, data),
    onMutate: async ({ categoryIds, data }) => ({ categories: await editList(queryClient, key, merge(categoryIds, data)) }),
    onError: (_error, _vars, context) => restoreList(queryClient, context?.categories),
    onSuccess: (_void, { categoryIds, data }) => confirmList(queryClient, key, merge(categoryIds, data)),
  });
}

/** Deletes a whole group — both halves of a "both", never one of them. */
export function useDeleteCategoryGroup() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({
    onceBy: (categoryIds: string[]) => categoryIds.join("|"),
    mutationFn: (categoryIds: string[]) => deleteCategories(userId, categoryIds),
    onSuccess: (_void, categoryIds) => dropCategories(queryClient, userId, categoryIds),
  });
}

/** Usage across every document behind a listed category. */
export function useCategoryGroupUsage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation({
    onceBy: (categoryIds: string[]) => categoryIds.join("|"),
    mutationFn: async (categoryIds: string[]) => {
      const counts = await Promise.all(categoryIds.map((id) => countCategoryUsage(userId, id)));
      return counts.reduce((a, b) => a + b, 0);
    },
  });
}
