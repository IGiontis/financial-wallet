import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { useAuth } from "../../shared/hooks/useAuth";
import { useHasAccess } from "../../shared/hooks/useHasAccess";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { newDocId } from "../../firebase/firestore";
import { deleteBusinessRecords, deletedBeforeFailure, deleteClosing, getBusinessEntries, saveClosing } from "../../firebase/business";
import { confirmList, editList, idsFor, removeWhere, restoreList, upsertById, withoutUndefined, type ListEdit, type ListSnapshot } from "../../lib/listCache";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { firestoreToDate } from "../../shared/utils/dates";
import { BUSINESS_CATEGORY_ID } from "../../shared/utils/categories";
import { BUSINESSES_KEY } from "./businessKeys";
import { closingLineIds } from "./businessSummary";
import { readBusinesses } from "./businessEdit";
import type { Business, BusinessEntry, BusinessEntryInput, CreateTransactionDTO, Transaction } from "../../shared/types/IndexTypes";

export const businessKeys = {
  all: (userId: string) => ["businessEntries", userId] as const,
};

// ─── The businesses (on the user document) ───────────────────────────────────

/**
 * The user's businesses — each with its own income and expense lines — and
 * their setter. On the user document: no read of their own, and a rename is
 * one write however many closings name the business or its lines.
 */
export function useBusinesses(): [Business[], (next: Business[] | ((previous: Business[]) => Business[])) => void] {
  const [stored, setStored] = useWorkspaceSetting<Business[]>(BUSINESSES_KEY, []);
  const businesses = useMemo(() => readBusinesses(stored), [stored]);
  return [businesses, setStored];
}

const randomPart = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
/** A fresh id for a business, made on this device. */
export const newBusinessId = () => `biz-${randomPart()}`;
/** A fresh id for a line of a business, made on this device. */
export const newLineId = () => `bl-${randomPart()}`;

// ─── The closings ────────────────────────────────────────────────────────────

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
// A closing edits two lists: the closings and the transactions (its personal
// record). It never writes a category.

/** What a save is handed. */
export interface ClosingSave {
  /** A correction: the closing's id and its personal record's. */
  editing?: { id: string; previousTransactionId?: string; createdAt?: Date };
  closing: BusinessEntryInput;
  /** The day's profit or loss as a personal record; `null` at 0. */
  personal: CreateTransactionDTO | null;
}

interface Snapshots {
  entries: ListSnapshot<BusinessEntry>;
  transactions: ListSnapshot<Transaction>;
}

const createdIds = new WeakMap<ClosingSave, { entryId: string; transactionId: string }>();

export function useSaveClosing() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = businessKeys.all(userId);
  const txKey = transactionKeys.all(userId);

  const idsOf = (vars: ClosingSave) => {
    const made = idsFor(createdIds, vars, () => ({ entryId: newDocId("businessEntries"), transactionId: newDocId("transactions") }));
    return { entryId: vars.editing?.id ?? made.entryId, transactionId: vars.editing?.previousTransactionId ?? made.transactionId };
  };

  /** The two lists as the write leaves them. */
  const edits = (vars: ClosingSave) => {
    const { entryId, transactionId } = idsOf(vars);
    const now = new Date();
    const entry = {
      ...withoutUndefined({ ...vars.closing, notes: vars.closing.notes?.trim() || undefined, accountId: vars.closing.accountId || undefined }),
      lineIds: closingLineIds(vars.closing),
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
      const row = {
        ...withoutUndefined(vars.personal),
        categoryId: BUSINESS_CATEGORY_ID,
        businessEntryId: entryId,
        businessId: vars.closing.businessId,
        id: transactionId,
        userId,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      } as Transaction;
      return insertTransaction(row)(rows);
    };
    return { entry: putEntry(entry), transactions };
  };

  return useOnceMutation<void, Error, ClosingSave, Snapshots>({
    onceBy: sameCall,
    mutationFn: async (vars) => {
      const { entryId, transactionId } = idsOf(vars);
      await saveClosing(userId, {
        entryId,
        closing: vars.closing,
        personal: vars.personal ? { id: transactionId, data: vars.personal } : null,
        editing: vars.editing ? { previousTransactionId: vars.editing.previousTransactionId } : undefined,
      });
    },
    onMutate: async (vars) => {
      const e = edits(vars);
      return {
        entries: await editList(queryClient, key, e.entry),
        transactions: await editList(queryClient, txKey, e.transactions),
      };
    },
    onError: (_e, _v, context) => {
      restoreList(queryClient, context?.entries);
      restoreList(queryClient, context?.transactions);
    },
    onSuccess: (_void, vars) => {
      const e = edits(vars);
      confirmList(queryClient, key, e.entry);
      confirmList(queryClient, txKey, e.transactions);
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

  return useOnceMutation<void, Error, Pick<BusinessEntry, "id" | "linkedTransactionId">>({
    onceBy: (entry) => entry.id,
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

/**
 * Deleting a business: its closings and their personal records (as the server
 * has them), then — only once they are gone — the business itself off the
 * user document. A failure part-way leaves the business there, with whatever
 * was not deleted yet: never closings of a business that no longer exists.
 */
export function useDeleteBusiness() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = businessKeys.all(userId);
  const txKey = transactionKeys.all(userId);
  const [, setBusinesses] = useBusinesses();

  const drop = (done: { businessEntries: string[]; transactions: string[] }, businessId?: string) => {
    const entries = new Set(done.businessEntries);
    const records = new Set(done.transactions);
    confirmList(queryClient, key, removeWhere<BusinessEntry>((row) => entries.has(row.id) || (!!businessId && row.businessId === businessId)));
    confirmList(queryClient, txKey, removeWhere<Transaction>((row) => records.has(row.id) || (!!businessId && row.businessId === businessId) || (!!row.businessEntryId && entries.has(row.businessEntryId))));
  };

  return useOnceMutation<{ businessEntries: string[]; transactions: string[] }, Error, string>({
    onceBy: (businessId) => businessId,
    mutationFn: (businessId) => deleteBusinessRecords(userId, businessId),
    onSuccess: (done, businessId) => {
      drop(done, businessId);
      setBusinesses((previous) => previous.filter((b) => b.id !== businessId));
    },
    // Part-way: what did go leaves the lists; the business and the rest stay, to be deleted again.
    onError: (err) => {
      const done = deletedBeforeFailure(err);
      if (done) drop(done);
    },
  });
}
