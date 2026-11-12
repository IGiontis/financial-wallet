import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { useHasAccess } from "../../shared/hooks/useHasAccess";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { newDocId } from "../../firebase/firestore";
import { deleteClosing, getBusinessEntries, moveBusinessCategory, saveClosing } from "../../firebase/business";
import { confirmList, editList, idsFor, removeWhere, restoreList, upsertById, withoutUndefined, type ListEdit, type ListSnapshot } from "../../lib/listCache";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { firestoreToDate } from "../../shared/utils/dates";
import { BUSINESS_CATEGORIES_KEY } from "./businessKeys";
import { lineCategoryIds } from "./businessSummary";
import type { BusinessCategory, BusinessEntry, BusinessEntryInput, Category, CreateCategoryDTO, CreateTransactionDTO, Transaction } from "../../shared/types/IndexTypes";

export const businessKeys = {
  all: (userId: string) => ["businessEntries", userId] as const,
};

const isCategory = (value: unknown): value is BusinessCategory => {
  const c = value as BusinessCategory;
  return !!c && typeof c.id === "string" && typeof c.name === "string";
};

/** The business's expense categories (on the user document — no read of their own) and their setter. */
export function useBusinessCategories(): [BusinessCategory[], (next: BusinessCategory[] | ((previous: BusinessCategory[]) => BusinessCategory[])) => void] {
  const [stored, setStored] = useWorkspaceSetting<BusinessCategory[]>(BUSINESS_CATEGORIES_KEY, []);
  const categories = useMemo(() => (Array.isArray(stored) ? stored.filter(isCategory).map(({ id, name }) => ({ id, name })) : []), [stored]);
  return [categories, setStored];
}

/** A fresh id for a business category, made on this device. */
export const newCategoryId = () => `bcat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Every closing of the user. Read only by the «Δουλειά» page — never from the
 * layout — and not at all while the page is switched off.
 */
export function useBusinessEntries() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const on = useHasAccess("business");
  return useQuery<BusinessEntry[]>({
    queryKey: businessKeys.all(userId),
    enabled: !!userId && on,
    queryFn: () => getBusinessEntries(userId),
  });
}

const byNewestFirst = (rows: BusinessEntry[]) => [...rows].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());
const putEntry =
  (row: BusinessEntry): ListEdit<BusinessEntry> =>
  (rows) =>
    byNewestFirst(upsertById(row)(rows));

// ─── Writing ──────────────────────────────────────────────────────────────────
// Optimistic, as every save: the rows are on screen under the ids they will
// keep before the write leaves (`listCache`), and a failure puts the lists back.
// A closing edits up to three lists: the closings, the transactions (its
// personal record) and the categories (the personal category, the first time).

/** What a save is handed. */
export interface ClosingSave {
  /** A correction: the closing's id and its personal record's. */
  editing?: { id: string; previousTransactionId?: string; createdAt?: Date };
  closing: BusinessEntryInput;
  /** The day's profit or loss as a personal record; `null` at 0. */
  personal: CreateTransactionDTO | null;
  newCategory?: { id: string; data: CreateCategoryDTO };
}

interface Snapshots {
  entries: ListSnapshot<BusinessEntry>;
  transactions: ListSnapshot<Transaction>;
  categories?: ListSnapshot<Category>;
}

const createdIds = new WeakMap<ClosingSave, { entryId: string; transactionId: string }>();

export function useSaveClosing() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = businessKeys.all(userId);
  const txKey = transactionKeys.all(userId);
  const catKey = transactionKeys.categories(userId);

  const idsOf = (vars: ClosingSave) => {
    const made = idsFor(createdIds, vars, () => ({ entryId: newDocId("businessEntries"), transactionId: newDocId("transactions") }));
    return { entryId: vars.editing?.id ?? made.entryId, transactionId: vars.editing?.previousTransactionId ?? made.transactionId };
  };

  /** The three lists as the write leaves them. */
  const edits = (vars: ClosingSave) => {
    const { entryId, transactionId } = idsOf(vars);
    const now = new Date();
    const entry = {
      ...withoutUndefined({ ...vars.closing, notes: vars.closing.notes?.trim() || undefined, accountId: vars.closing.accountId || undefined }),
      categoryIds: lineCategoryIds(vars.closing.expenses),
      linkedTransactionId: vars.personal ? transactionId : undefined,
      id: entryId,
      userId,
      createdAt: vars.editing?.createdAt ?? now,
      updatedAt: now,
    } as BusinessEntry;
    if (!entry.linkedTransactionId) delete (entry as Partial<BusinessEntry>).linkedTransactionId;
    const transactions: ListEdit<Transaction> = (rows) => {
      if (!vars.personal) return vars.editing?.previousTransactionId ? rows.filter((r) => r.id !== vars.editing!.previousTransactionId) : rows;
      const old = rows.find((r) => r.id === transactionId);
      const row = { ...withoutUndefined(vars.personal), businessEntryId: entryId, id: transactionId, userId, createdAt: old?.createdAt ?? now, updatedAt: now } as Transaction;
      return insertTransaction(row)(rows);
    };
    const category = vars.newCategory ? ({ ...vars.newCategory.data, id: vars.newCategory.id, userId, isDefault: false, createdAt: now, updatedAt: now } as Category) : undefined;
    return { entry: putEntry(entry), transactions, category: category ? upsertById(category) : undefined };
  };

  return useMutation<void, Error, ClosingSave, Snapshots>({
    mutationFn: async (vars) => {
      const { entryId, transactionId } = idsOf(vars);
      await saveClosing(userId, {
        entryId,
        closing: vars.closing,
        personal: vars.personal ? { id: transactionId, data: vars.personal } : null,
        newCategory: vars.newCategory,
        editing: vars.editing ? { previousTransactionId: vars.editing.previousTransactionId } : undefined,
      });
    },
    onMutate: async (vars) => {
      const e = edits(vars);
      return {
        entries: await editList(queryClient, key, e.entry),
        transactions: await editList(queryClient, txKey, e.transactions),
        categories: e.category ? await editList(queryClient, catKey, e.category) : undefined,
      };
    },
    onError: (_e, _v, context) => {
      restoreList(queryClient, context?.entries);
      restoreList(queryClient, context?.transactions);
      restoreList(queryClient, context?.categories);
    },
    onSuccess: (_void, vars) => {
      const e = edits(vars);
      confirmList(queryClient, key, e.entry);
      confirmList(queryClient, txKey, e.transactions);
      if (e.category) confirmList(queryClient, catKey, e.category);
    },
  });
}

/** Deleting a closing takes its personal record with it. Waits for a connection. */
export function useDeleteClosing() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = businessKeys.all(userId);
  const txKey = transactionKeys.all(userId);

  return useMutation<void, Error, Pick<BusinessEntry, "id" | "linkedTransactionId">>({
    mutationFn: async (entry) => {
      await deleteClosing(userId, entry.id, entry.linkedTransactionId);
    },
    // Deletes wait for the server's answer (`offlinePolicy`): the rows go once it is in.
    onSuccess: (_void, entry) => {
      confirmList(queryClient, key, removeWhere<BusinessEntry>((row) => row.id === entry.id));
      confirmList(queryClient, txKey, removeWhere<Transaction>((row) => row.id === entry.linkedTransactionId || row.businessEntryId === entry.id));
    },
  });
}

/** Moves every line of one business category to another, before the first is deleted. */
export function useMoveBusinessCategory() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = businessKeys.all(userId);
  return useMutation<{ id: string; expenses: BusinessEntry["expenses"]; categoryIds: string[] }[], Error, { fromId: string; toId: string }>({
    mutationFn: ({ fromId, toId }) => moveBusinessCategory(userId, fromId, toId),
    onSuccess: (moved) => {
      const byId = new Map(moved.map((m) => [m.id, m]));
      confirmList<BusinessEntry>(queryClient, key, (rows) => rows.map((row) => (byId.has(row.id) ? { ...row, ...byId.get(row.id)!, updatedAt: new Date() } : row)));
    },
  });
}
