import { collection, deleteField, doc, getDocs, query, serverTimestamp, writeBatch, where } from "./firestoreApi";
import { db } from "./config";
import { noteDeleted, noteDeletions, noteRecreated, syncedList } from "./syncList";
import { stillThere } from "./firestore";
import { meterRead } from "../lib/readMeter";
import { requireConnection } from "../shared/utils/offlinePolicy";
import { cleanTextFields } from "../shared/utils/cleanText";
import { lineCategoryIds } from "../features/business/businessSummary";
import type { BusinessEntry, BusinessEntryInput, BusinessExpense, CreateCategoryDTO, CreateTransactionDTO } from "../shared/types/IndexTypes";

// ─── «Δουλειά»: a day's closing ──────────────────────────────────────────────
//
// One flat collection, `businessEntries`, every document carrying `userId`, as
// every other list: read whole once per device and then only what changed
// (`syncedList`), and only once the page is opened.
//
// A closing and the day's profit in the owner's own money are written as one:
// the closing here, a personal income (or, for a loss, an expense) in
// `transactions`, each naming the other — and, the first time, the personal
// category it is filed under — in ONE batch. Changed and deleted together too.
//
// Production rules refuse to update or delete a document that is not there and
// fail the whole batch with it: the personal record is read first
// (`stillThere`) before a batch names it.

/** Firestore rejects undefined values; user text is cleaned on the way, as everywhere. */
const clean = (obj: Record<string, unknown>) => cleanTextFields(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)));

/** The lines as stored: no empty note, no undefined. */
const storedLines = (expenses: readonly BusinessExpense[]) => expenses.map((line) => clean({ categoryId: line.categoryId, amount: line.amount, note: line.note?.trim() || undefined }));

/** Every closing of the user. Read whole once per device, then only what changed — see `syncedList`. */
export const getBusinessEntries = (userId: string) => syncedList<BusinessEntry>("businessEntries", userId);

export interface ClosingWrite {
  entryId: string;
  closing: BusinessEntryInput;
  /** The day's profit or loss in the owner's own money; `null` when it came to 0. */
  personal: { id: string; data: CreateTransactionDTO } | null;
  /** The personal category, made with this save the first time it is needed. */
  newCategory?: { id: string; data: CreateCategoryDTO };
  /** A correction: the closing exists, and this was its personal record. */
  editing?: { previousTransactionId?: string };
}

/**
 * Saves a closing — new, or corrected — with its personal record, in ONE batch.
 *
 * Corrected: the personal record is read first. There, it is updated in place
 * (its type flips when a profit became a loss); gone — removed elsewhere — it
 * is written again under its id and its deletion taken out of the sync's log;
 * no longer wanted (the day came to 0), it is deleted, only if it is there.
 */
export async function saveClosing(userId: string, w: ClosingWrite) {
  const previous = w.editing?.previousTransactionId;
  const there = previous ? await stillThere("transactions", previous) : false;
  const stamp = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const batch = writeBatch(db);

  const fields = {
    date: w.closing.date,
    turnover: w.closing.turnover,
    expenses: storedLines(w.closing.expenses),
    categoryIds: lineCategoryIds(w.closing.expenses),
  };
  const entryRef = doc(db, "businessEntries", w.entryId);
  if (w.editing) {
    batch.update(entryRef, {
      ...cleanTextFields(fields),
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
    const data = clean({ ...w.personal.data, businessEntryId: w.entryId });
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
  if (w.newCategory) {
    batch.set(doc(db, "categories", w.newCategory.id), { ...clean({ ...w.newCategory.data, userId, isDefault: false }), ...stamp() });
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

const errorCode = (err: unknown) => (err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "");

/**
 * A business category is being deleted and its lines go to another one: every
 * closing that names it, as the server has them now — found by `categoryIds`
 * with one `array-contains` query (or, should that query be refused for want
 * of an index, by reading the user's closings whole) — rewritten in one batch.
 * Closings only this device knew, already deleted elsewhere, are never named.
 * Returns each moved closing's new lines.
 */
export async function moveBusinessCategory(userId: string, fromId: string, toId: string) {
  requireConnection("bulk");
  let docs: { id: string; data: () => Record<string, unknown> }[];
  try {
    const snap = await getDocs(query(collection(db, "businessEntries"), where("userId", "==", userId), where("categoryIds", "array-contains", fromId)));
    meterRead("businessEntries (category move)", snap.size, !!snap.metadata?.fromCache);
    docs = snap.docs;
  } catch (err) {
    if (errorCode(err) !== "failed-precondition") throw err;
    const snap = await getDocs(query(collection(db, "businessEntries"), where("userId", "==", userId)));
    meterRead("businessEntries (category move, whole)", snap.size, !!snap.metadata?.fromCache);
    docs = snap.docs;
  }
  const moved: { id: string; expenses: BusinessExpense[]; categoryIds: string[] }[] = [];
  for (const d of docs) {
    const lines = (d.data().expenses as BusinessExpense[] | undefined) ?? [];
    if (!lines.some((line) => line.categoryId === fromId)) continue;
    const expenses = lines.map((line) => (line.categoryId === fromId ? { ...line, categoryId: toId } : line));
    moved.push({ id: d.id, expenses, categoryIds: lineCategoryIds(expenses) });
  }
  for (let i = 0; i < moved.length; i += 450) {
    const batch = writeBatch(db);
    for (const m of moved.slice(i, i + 450)) batch.update(doc(db, "businessEntries", m.id), { expenses: m.expenses, categoryIds: m.categoryIds, updatedAt: serverTimestamp() });
    await batch.commit();
  }
  return moved;
}
