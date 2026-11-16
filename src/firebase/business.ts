import { collection, deleteField, doc, getDocsFromServer, query, serverTimestamp, writeBatch, where } from "./firestoreApi";
import { db } from "./config";
import { noteDeleted, noteDeletions, noteRecreated, syncedList } from "./syncList";
import { stillThere } from "./firestore";
import { meterRead } from "../lib/readMeter";
import { requireConnection } from "../shared/utils/offlinePolicy";
import { cleanTextFields } from "../shared/utils/cleanText";
import { refuseFutureDates } from "../shared/utils/dates";
import { BUSINESS_CATEGORY_ID } from "../shared/utils/categories";
import { closingLineIds } from "../features/business/businessSummary";
import { LINES_MAX } from "../features/business/businessKeys";
import type { BusinessEntry, BusinessEntryInput, BusinessExpense, BusinessIncome, CreateTransactionDTO } from "../shared/types/IndexTypes";

// ─── «Δουλειά»: a day's closing ──────────────────────────────────────────────
//
// One flat collection, `businessEntries`, every document carrying `userId`, as
// every other list: read whole once per device and then only what changed
// (`syncedList`), and only once the page is opened. The businesses themselves
// (names and lines) are on the user document, not here.
//
// A closing and the day's profit in the owner's own money are written as one:
// the closing here, a personal income (or, for a loss, an expense) in
// `transactions`, each naming the other, in ONE batch. The personal record is
// filed under no category of the user's (`BUSINESS_CATEGORY_ID`, «Δουλειά»),
// so no `categories` document is ever written from here. Changed and deleted
// together too.
//
// Production rules refuse to update or delete a document that is not there and
// fail the whole batch with it: the personal record is read first
// (`stillThere`) before a batch names it, and deleting a business deletes only
// what the server answers is there.

/** The most incomes and expenses one closing keeps — the rules' limit. */
const CLOSING_LINES_MAX = LINES_MAX;
/** Firestore allows 500 writes in a batch; the app stops at 450, as `commitDeletes`. */
const CHUNK = 450;

/** Firestore rejects undefined values; user text is cleaned on the way, as everywhere. */
const clean = (obj: Record<string, unknown>) => cleanTextFields(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)));

/** The incomes as stored: a line and an amount, nothing else. */
const storedIncomes = (incomes: readonly BusinessIncome[]) => incomes.map((line) => ({ lineId: line.lineId, amount: line.amount }));
/** The expenses as stored: a line or a one-off's name, the amount, a note if any; no undefined. */
const storedExpenses = (expenses: readonly BusinessExpense[]) =>
  expenses.map((line) => clean({ lineId: line.lineId || undefined, name: line.lineId ? undefined : line.name?.trim() || undefined, amount: line.amount, note: line.note?.trim() || undefined }));

/** Every closing of the user. Read whole once per device, then only what changed — see `syncedList`. */
export const getBusinessEntries = (userId: string) => syncedList<BusinessEntry>("businessEntries", userId);

export interface ClosingWrite {
  entryId: string;
  closing: BusinessEntryInput;
  /** The day's profit or loss in the owner's own money; `null` when it came to 0. */
  personal: { id: string; data: CreateTransactionDTO } | null;
  /** A correction: the closing exists, and this was its personal record; `storedDate` its day as stored. */
  editing?: { previousTransactionId?: string; storedDate?: Date };
}

/** What every personal record of a closing carries, whatever the form handed over. */
const recordFields = (data: CreateTransactionDTO, entryId: string, businessId: string) => clean({ ...data, categoryId: BUSINESS_CATEGORY_ID, businessEntryId: entryId, businessId });

/**
 * Saves a closing — new, or corrected — with its personal record, in ONE batch.
 *
 * Corrected: the personal record is read first. There, it is updated in place
 * (its type flips when a profit became a loss, its business and description
 * follow the closing); gone — removed elsewhere — it is written again under its
 * id and its deletion taken out of the sync's log; no longer wanted (the day
 * came to 0), it is deleted, only if it is there.
 */
export async function saveClosing(userId: string, w: ClosingWrite) {
  if (w.closing.incomes.length > CLOSING_LINES_MAX || w.closing.expenses.length > CLOSING_LINES_MAX) throw new Error("A closing keeps at most 30 incomes and 30 expenses");
  // A day that was closed: never after today (owner, 2026-11-14). A correction may keep its day.
  refuseFutureDates([w.closing.date, w.personal?.data.date], { stored: w.editing?.storedDate });
  const previous = w.editing?.previousTransactionId;
  const there = previous ? await stillThere("transactions", previous) : false;
  const stamp = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const batch = writeBatch(db);

  const fields = {
    businessId: w.closing.businessId,
    date: w.closing.date,
    incomes: storedIncomes(w.closing.incomes),
    expenses: storedExpenses(w.closing.expenses),
    lineIds: closingLineIds(w.closing),
  };
  const entryRef = doc(db, "businessEntries", w.entryId);
  if (w.editing) {
    batch.update(entryRef, {
      ...fields,
      notes: w.closing.notes?.trim() ? cleanTextFields({ notes: w.closing.notes }).notes : deleteField(),
      accountId: w.closing.accountId ? w.closing.accountId : deleteField(),
      linkedTransactionId: w.personal ? w.personal.id : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(entryRef, { ...clean({ ...fields, notes: w.closing.notes?.trim() || undefined, accountId: w.closing.accountId, linkedTransactionId: w.personal?.id, userId }), ...stamp() });
  }

  let recreated = false;
  let removed: string | undefined;
  if (w.personal) {
    const data = recordFields(w.personal.data, w.entryId, w.closing.businessId);
    const txRef = doc(db, "transactions", w.personal.id);
    if (w.editing && there && previous === w.personal.id) {
      batch.update(txRef, { ...data, notes: w.personal.data.notes ? data.notes : deleteField(), accountId: w.personal.data.accountId ? data.accountId : deleteField(), updatedAt: serverTimestamp() });
    } else {
      batch.set(txRef, { ...data, userId, ...stamp() });
      recreated = !!w.editing && previous === w.personal.id;
    }
  }
  if (previous && there && previous !== w.personal?.id) {
    batch.delete(doc(db, "transactions", previous));
    removed = previous;
  }

  await batch.commit();
  if (recreated) await noteRecreated(userId, "transactions", [w.personal!.id]);
  if (removed) await noteDeleted(userId, "transactions", [removed]);
  return { recreated, removedTransactionId: removed };
}

/**
 * Deleting a closing takes its personal record with it, in one batch — when
 * that is still there (read first: deleting a missing document fails the whole
 * batch in production). Both lists' deletions go to the log in ONE write.
 * Returns whether the personal record went too.
 */
export async function deleteClosing(userId: string, entryId: string, transactionId: string | undefined) {
  requireConnection("delete");
  const there = !!transactionId && (await stillThere("transactions", transactionId));
  const batch = writeBatch(db);
  batch.delete(doc(db, "businessEntries", entryId));
  if (there) batch.delete(doc(db, "transactions", transactionId!));
  await batch.commit();
  await noteDeletions(userId, { businessEntries: [entryId], transactions: there ? [transactionId!] : [] });
  return { transactionId: there ? transactionId : undefined };
}

/**
 * Deleting a business: every closing of it and every personal record of their
 * profits and losses, as the SERVER has them now — two equality queries
 * (`userId` + `businessId`, automatic indexes), so a batch never names a
 * document already gone. Each closing goes in the same batch as its record
 * (pairs never split), ≤ 450 writes a batch; the deletions go to the sync's
 * log in one write, also when a later batch fails (what was deleted is said).
 * The business's own definition, on the user document, is the caller's to
 * remove LAST, once this has resolved.
 *
 * Costs: one read per closing and per record (an empty answer is one read),
 * one delete each, one log write.
 */
export async function deleteBusinessRecords(userId: string, businessId: string) {
  requireConnection("delete");
  const [entries, records] = await Promise.all([
    getDocsFromServer(query(collection(db, "businessEntries"), where("userId", "==", userId), where("businessId", "==", businessId))),
    getDocsFromServer(query(collection(db, "transactions"), where("userId", "==", userId), where("businessId", "==", businessId))),
  ]);
  meterRead("businessEntries (business deletion)", entries.size, false);
  meterRead("transactions (business deletion)", records.size, false);

  // Each closing with its own record, then any record whose closing is gone already.
  const recordOf = new Map(records.docs.map((d) => [String(d.data().businessEntryId ?? ""), d]));
  const paired = new Set<string>();
  const groups: { col: "businessEntries" | "transactions"; id: string; ref: (typeof entries.docs)[number]["ref"] }[][] = [];
  for (const e of entries.docs) {
    const group: (typeof groups)[number] = [{ col: "businessEntries", id: e.id, ref: e.ref }];
    const tx = recordOf.get(e.id);
    if (tx) {
      group.push({ col: "transactions", id: tx.id, ref: tx.ref });
      paired.add(tx.id);
    }
    groups.push(group);
  }
  for (const tx of records.docs) if (!paired.has(tx.id)) groups.push([{ col: "transactions", id: tx.id, ref: tx.ref }]);

  const done = { businessEntries: [] as string[], transactions: [] as string[] };
  try {
    let batch = writeBatch(db);
    let pending: (typeof groups)[number] = [];
    const commit = async () => {
      if (pending.length === 0) return;
      await batch.commit();
      for (const op of pending) done[op.col].push(op.id);
      batch = writeBatch(db);
      pending = [];
    };
    for (const group of groups) {
      if (pending.length + group.length > CHUNK) await commit();
      for (const op of group) batch.delete(op.ref);
      pending.push(...group);
    }
    await commit();
  } catch (err) {
    // What did go is told to the caller with the error, so the screen drops those rows too.
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { deleted: done });
  } finally {
    if (done.businessEntries.length + done.transactions.length > 0) await noteDeletions(userId, done);
  }
  return done;
}

/** The records a failed `deleteBusinessRecords` had already deleted, if any. */
export const deletedBeforeFailure = (err: unknown): { businessEntries: string[]; transactions: string[] } | undefined =>
  err && typeof err === "object" && "deleted" in err ? (err as { deleted: { businessEntries: string[]; transactions: string[] } }).deleted : undefined;
