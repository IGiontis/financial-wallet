import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, getCountFromServer, addDoc, serverTimestamp, deleteField, writeBatch, getDocsFromServer, getDocFromServer, waitForPendingWrites, type Query } from "./firestoreApi";
import { db } from "./config";
import { noteDeleted, noteDeletions, noteRecreated, noteReset, syncedList } from "./syncList";
import { OWNED_COLLECTIONS, USERS_COLLECTION } from "./ownedCollections";
import { beginAccountDeletion } from "./deletionGate";
import { meterRead } from "../lib/readMeter";
import { localDeletePrefix, localGet, localSet } from "../lib/localStore";
import { requireConnection } from "../shared/utils/offlinePolicy";
import { debtEdit } from "../features/debts/debtsUtils";
import { firestoreToDate } from "../shared/utils/dates";
import { cleanText, cleanTextFields } from "../shared/utils/cleanText";

import type {
  Debt,
  DebtPayment,
  CreateDebtDTO,
  UpdateDebtDTO,
  CreateDebtPaymentDTO,
  User,
  CreateUserDTO,
  UpdateUserDTO,
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  Category,
  TransactionType,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  InvestmentGoal,
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  InvestmentContribution,
  CreateInvestmentContributionDTO,
  Bill,
  CreateBillDTO,
  UpdateBillDTO,
  BillPayment,
  CreateBillPaymentDTO,
} from "../shared/types/IndexTypes";
import type { DebtCashRecord } from "../features/debts/debtCash";
import { transferIds, type TransferRecord } from "../features/transactions/transfers";

// ─── Helper ───────────────────────────────────────────────────────────────────
// Firestore rejects undefined values — strip them before every write. User text
// (names, descriptions, notes …) is cleaned on the way: see `cleanTextFields`.

const clean = (obj: Record<string, unknown>) => cleanTextFields(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)));

/** A query read from the server, counted by name while developing — see `readMeter`. */
const readAll = async (label: string, q: Query) => {
  const snap = await getDocs(q);
  meterRead(label, snap.size, !!snap.metadata?.fromCache);
  return snap;
};

/**
 * A fresh document id, made on this device with no round trip.
 *
 * Creating under an id chosen up front — rather than `addDoc`, which picks one
 * as it writes — means the row put on screen the moment Save is pressed already
 * carries the id it will keep. The cache can then be corrected in place instead
 * of re-reading the whole collection to learn what the id turned out to be.
 */
export const newDocId = (collectionName: string) => doc(collection(db, collectionName)).id;

/** Firestore allows 500 writes per batch; stay clear of it. */
const DELETE_CHUNK = 450;

/**
 * Deletes in batches, in the order given.
 *
 * Anything up to the chunk size goes in one atomic batch. Beyond it, callers
 * put the document that makes the rest visible — the goal, say — last, so a
 * failure part-way leaves it on screen to be deleted again rather than leaving
 * its remains behind with nothing pointing at them.
 */
const commitDeletes = async (refs: ReturnType<typeof doc>[]) => {
  for (let i = 0; i < refs.length; i += DELETE_CHUNK) {
    const batch = writeBatch(db);
    refs.slice(i, i + DELETE_CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

// ─── USERS ────────────────────────────────────────────────────────────────────

export const createUser = async (uid: string, data: CreateUserDTO) => {
  const currency = data.currency ?? "EUR";
  await setDoc(doc(db, "users", uid), {
    ...clean({ ...data }),
    id: uid,
    currency, // display currency — can be changed later
    baseCurrency: currency, // base currency — set once, never changes
    locale: data.locale ?? "en",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const getUser = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
  meterRead("users", 1, !!snap.metadata?.fromCache);
  return snap.exists() ? (snap.data() as User) : null;
};

export const updateUser = async (uid: string, data: UpdateUserDTO) => {
  await updateDoc(doc(db, "users", uid), {
    ...clean({ ...data }), // add clean() here
    updatedAt: serverTimestamp(),
  });
};


/**
 * One key of the workspace, written on its own.
 *
 * A dotted path rather than a whole `workspace` object: two screens write to it,
 * and sending the object would mean whichever wrote last erased whatever the
 * other had changed in between. Firestore merges a dotted field in place.
 */
export const saveWorkspaceValue = async (uid: string, key: string, value: unknown) => {
  await updateDoc(doc(db, "users", uid), { [`workspace.${key}`]: cleanTextFields(value), updatedAt: serverTimestamp() });
};

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

/** `id` comes from `newDocId` when the caller has already shown the row under it. */
export const createTransaction = async (userId: string, data: CreateTransactionDTO, id: string = newDocId("transactions")) => {
  await setDoc(doc(db, "transactions", id), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/**
 * Every transaction of the user. Read whole once per device, then only what
 * changed since — see `syncedList`. Every delete below says so through
 * `noteDeleted`, or other devices would go on showing the record.
 */
export const getTransactions = (userId: string) => syncedList<Transaction>("transactions", userId);

/**
 * The payment record behind an expense logged by paying a bill (`billId` set).
 *
 * The two are one fact written twice — the Bills screen reads the payment, the
 * balance reads the expense — so changing one alone makes them disagree: the
 * bill stays "paid" for an expense that is gone, or shows €110 paid while the
 * balance took €95.
 */
export interface BillPaymentLink {
  userId: string;
  /** Known from the bills already on screen; looked up by `transactionId` when not. */
  paymentId?: string;
}

const billPaymentIdsFor = async ({ userId, paymentId }: BillPaymentLink, transactionId: string): Promise<string[]> => {
  // The id comes from this device's copy; another device may have deleted that
  // payment since, and naming a missing document fails the whole batch in
  // production. One read to make sure is cheaper than a write that never lands.
  if (paymentId) return (await stillThere("billPayments", paymentId)) ? [paymentId] : [];
  const snap = await getDocs(query(collection(db, "billPayments"), where("userId", "==", userId), where("transactionId", "==", transactionId)));
  return snap.docs.map((d) => d.id);
};

export const updateTransaction = async (transactionId: string, data: UpdateTransactionDTO, billPayment?: BillPaymentLink) => {
  const firestoreData = {
    ...clean({ ...data }),
    metadata: data.metadata === undefined ? deleteField() : data.metadata,
    // Only touched when the form speaks about it: `null` clears it, a string sets it.
    ...(data.accountId === null ? { accountId: deleteField() } : {}),
    updatedAt: serverTimestamp(),
  };

  // The mirror image of `updateBillPayment`: correcting a bill's expense from
  // the Transactions screen corrects the payment with it, in the same batch.
  // The payment keeps only the amount and the day; its period is untouched,
  // exactly as when the day is changed from the Bills screen.
  const paymentChanges = clean({ amount: data.amount, paidDate: data.date });
  if (!billPayment || Object.keys(paymentChanges).length === 0) {
    await updateDoc(doc(db, "transactions", transactionId), firestoreData);
    return;
  }

  const paymentIds = await billPaymentIdsFor(billPayment, transactionId);
  const batch = writeBatch(db);
  batch.update(doc(db, "transactions", transactionId), firestoreData);
  for (const id of paymentIds) batch.update(doc(db, "billPayments", id), { ...paymentChanges, updatedAt: serverTimestamp() });
  await batch.commit();
};

/** Deleting a bill's expense takes its payment with it, so the bill goes back to unpaid. */
export const deleteTransaction = async (userId: string, transactionId: string, billPayment?: BillPaymentLink) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  if (!billPayment) {
    await deleteDoc(doc(db, "transactions", transactionId));
    await noteDeleted(userId, "transactions", [transactionId]);
    return;
  }

  const paymentIds = await billPaymentIdsFor(billPayment, transactionId);
  const batch = writeBatch(db);
  batch.delete(doc(db, "transactions", transactionId));
  for (const id of paymentIds) batch.delete(doc(db, "billPayments", id));
  await batch.commit();
  await noteDeletions(userId, { transactions: [transactionId], billPayments: paymentIds });
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

// This fixes the duplicate categories issue by deduplicating by name+type
// instead of just id (which fails when seed runs twice creating same name but different id)

/** How long the shared default categories are kept on the device before being read again. */
const DEFAULT_CATEGORIES_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The seeded categories every user shares. They change only when the seed
 * does, yet were read — thirty-odd documents — every time anyone opened the
 * app; now once a week per device.
 */
const getDefaultCategories = async (): Promise<Category[]> => {
  const kept = await localGet<{ at: number; rows: Category[] }>("ref:categories-default");
  if (kept && Array.isArray(kept.rows) && kept.rows.length > 0 && Date.now() - kept.at < DEFAULT_CATEGORIES_KEEP_MS) return kept.rows;
  const snap = await readAll("categories (defaults)", query(collection(db, "categories"), where("isDefault", "==", true)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
  if (!snap.metadata?.fromCache && rows.length > 0) {
    // Plain values only on the device: the timestamps become dates.
    await localSet("ref:categories-default", { at: Date.now(), rows: rows.map(({ createdAt, updatedAt, ...rest }) => ({ ...rest, createdAt: firestoreToDate(createdAt), updatedAt: firestoreToDate(updatedAt) })) });
  }
  return rows;
};

/**
 * The shared defaults (kept on the device for a week, above) and the user's own
 * categories, which are read whole once per device and then only what changed
 * — see `syncedList`. The own list is the one with `userId` set; the defaults
 * carry none, so the two never overlap.
 */
export const getCategories = async (userId: string) => {
  const [userCats, defaultCats] = await Promise.all([syncedList<Category>("categories", userId), getDefaultCategories()]);

  // Merge — user categories take priority over defaults with the same name+type
  const all = [...defaultCats, ...userCats];

  // Deduplicate by name+type (prevents duplicates if seed ran multiple times)
  return Array.from(new Map(all.map((c) => [`${c.type}-${c.name}`, c])).values());
};

// A user's own category. `isDefault: false` and a real `userId` are what keep
// it out of everyone else's list — the seeded ones carry `userId: null`.
export const createCategory = async (userId: string, data: CreateCategoryDTO) => {
  const ref = await addDoc(collection(db, "categories"), {
    ...clean({ ...data, userId, isDefault: false }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

/**
 * Creates one category per type in a single batch.
 *
 * Some things genuinely are both: betting is money out most weeks and money in
 * occasionally, and so are taxes and side work. The seeded list already handles
 * that with two documents sharing a name — one per type — because a transaction
 * form only ever offers the categories matching what it is recording, and a
 * single "both" document would have to be filtered in by every one of those
 * screens.
 *
 * Batched so the pair cannot half-exist: a second write failing on its own
 * would leave an "income and expense" category that only works one way, with
 * nothing on screen to explain why.
 */
export const createCategories = async (userId: string, data: Omit<CreateCategoryDTO, "type">, types: TransactionType[], ids: Partial<Record<TransactionType, string>> = {}): Promise<Record<string, string>> => {
  const batch = writeBatch(db);
  const created: Record<string, string> = {};

  for (const type of types) {
    // Under the id the screen already shows it with, when it has one (`newDocId`).
    const ref = ids[type] ? doc(db, "categories", ids[type]) : doc(collection(db, "categories"));
    batch.set(ref, {
      ...clean({ ...data, type, userId, isDefault: false }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created[type] = ref.id;
  }

  await batch.commit();
  return created;
};

/** Renames or restyles every document in a "both" pair at once. */
export const updateCategories = async (categoryIds: string[], data: UpdateCategoryDTO) => {
  const batch = writeBatch(db);

  for (const id of categoryIds) {
    batch.update(doc(db, "categories", id), {
      ...clean({ ...data }),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
};

/** Removes a whole pair, so "both" never half-disappears either. */
export const deleteCategories = async (userId: string, categoryIds: string[]) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const batch = writeBatch(db);
  for (const id of categoryIds) batch.delete(doc(db, "categories", id));
  await batch.commit();
  await noteDeleted(userId, "categories", categoryIds);
};

export const updateCategory = async (categoryId: string, data: UpdateCategoryDTO) => {
  await updateDoc(doc(db, "categories", categoryId), { ...clean({ ...data }), updatedAt: serverTimestamp() });
};

export const deleteCategory = async (userId: string, categoryId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  await deleteDoc(doc(db, "categories", categoryId));
  await noteDeleted(userId, "categories", [categoryId]);
};

/**
 * How many records point at a category. Deleting one still in use would leave
 * those rows showing a blank category with no way to find them again, so the
 * UI blocks on this count rather than cascading the delete.
 *
 * Counted on the server rather than by downloading the rows: a count bills one
 * read per thousand matches, where fetching them bills one read each — a few
 * hundred for a busy category, to learn a single number.
 */
export const countCategoryUsage = async (userId: string, categoryId: string): Promise<number> => {
  const [txCount, billCount] = await Promise.all([
    getCountFromServer(query(collection(db, "transactions"), where("userId", "==", userId), where("categoryId", "==", categoryId))),
    getCountFromServer(query(collection(db, "bills"), where("userId", "==", userId), where("categoryId", "==", categoryId))),
  ]);
  return txCount.data().count + billCount.data().count;
};

// ─── INVESTMENT GOALS ─────────────────────────────────────────────────────────

export const createInvestmentGoal = async (userId: string, data: CreateInvestmentGoalDTO, isActive: boolean = true, id: string = newDocId("investmentGoals")) => {
  // Remove undefined fields — Firestore does not accept undefined
  const cleaned = clean({ ...data, userId, isActive, isCompleted: false });

  // Under an id chosen up front, so the goal already on screen is the one saved — see `newDocId`.
  await setDoc(doc(db, "investmentGoals", id), {
    ...cleaned,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/** Read whole once per device, then only what changed — see `syncedList`. */
export const getInvestmentGoals = (userId: string) => syncedList<InvestmentGoal>("investmentGoals", userId);

export const updateInvestmentGoal = async (goalId: string, data: UpdateInvestmentGoalDTO) => {
  const cleaned = clean({ ...data });
  await updateDoc(doc(db, "investmentGoals", goalId), {
    ...cleaned,
    // Taken off: `clean()` would drop a null, and the old date would stay.
    ...(data.planFrom === null ? { planFrom: deleteField() } : {}),
    ...(data.parts === null ? { parts: deleteField() } : {}),
    updatedAt: serverTimestamp(),
  });
};

/**
 * A loan someone took on to pay part of a goal, taken back with the goal as if
 * it never happened — the owner's «Δεν του χρωστάω τίποτα — σβήσ' τα»: the debt,
 * the expense written beside it (`expenseId`: the one the debt names, or for a
 * debt older than that link, the one the device matched by its figures) and the
 * debt's own cash records. Its deposit goes with the goal's other contributions.
 */
export interface CoveredErase {
  debtId: string;
  expenseId?: string;
}

/**
 * A loan to take back that has repayments on the server: deleting them would
 * move a card's balance, so the whole delete is refused and nothing is written
 * — the dialog offers the answer only for a loan with none.
 */
export class CoveredRepaidError extends Error {
  readonly debtId: string;
  constructor(debtId: string) {
    super(`Debt ${debtId} has repayments; it cannot be taken back with its goal.`);
    this.debtId = debtId;
    this.name = "CoveredRepaidError";
  }
}

/**
 * What taking these loans back deletes, read from the server so that only
 * documents that are there are named — production refuses a delete of a missing
 * one and fails the whole batch with it. Per loan: the debt (read by id), its
 * repayments and its cash records (`debt_<id>` …, everything carrying its
 * `debtId` — equality on `userId` + `debtId`, automatic indexes), and the
 * expense (read by id). Four reads a loan, and only for loans taken back.
 *
 * A loan already gone (deleted from «Χρέη» meanwhile) is not named, nor is its
 * expense unless that is still there. A loan of another goal, or one that turns
 * out to have repayments, stops everything before anything is written.
 *
 * One group per loan, so a loan's records always go in the same batch.
 */
const coveredErasure = async (userId: string, goalId: string, erase: CoveredErase[]) => {
  const groups: ReturnType<typeof doc>[][] = [];
  const debtIds: string[] = [];
  const transactionIds: string[] = [];
  const read = async (name: string, id: string) => {
    const snap = await getDoc(doc(db, name, id));
    meterRead(name, 1, !!snap.metadata?.fromCache);
    return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  };
  const ofDebt = (name: string, debtId: string) => readAll(name, query(collection(db, name), where("userId", "==", userId), where("debtId", "==", debtId)));
  const found = await Promise.all(
    erase.map(async ({ debtId, expenseId }) => {
      const [debt, payments, cash, expense] = await Promise.all([read("debts", debtId), ofDebt("debtPayments", debtId), ofDebt("transactions", debtId), expenseId ? read("transactions", expenseId) : undefined]);
      return { debtId, expenseId, debt, payments, cash, expense };
    }),
  );
  for (const { debtId, expenseId, debt, payments, cash, expense } of found) {
    if (debt && (debt.forGoalId !== goalId || debt.direction !== "owed_by_me")) throw new Error(`Debt ${debtId} is not a loan of goal ${goalId}.`);
    if (debt && payments.size > 0) throw new CoveredRepaidError(debtId);
    const group: ReturnType<typeof doc>[] = [];
    // Only the expense of what was bought: never a goal's mirror or a debt's own record.
    if (expenseId && expense && expense.type === "expense" && !expense.goalId && !expense.debtId) {
      group.push(doc(db, "transactions", expenseId));
      transactionIds.push(expenseId);
    }
    for (const d of cash.docs) {
      group.push(d.ref);
      transactionIds.push(d.id);
    }
    if (debt) {
      group.push(doc(db, "debts", debtId));
      debtIds.push(debtId);
    }
    if (group.length > 0) groups.push(group);
  }
  return { groups, debtIds, transactionIds };
};

/**
 * As `commitDeletes`, for records that must go together: each group whole in
 * one batch, never split across two. A group joins the current batch while it
 * fits under the chunk size, and opens the next one otherwise.
 */
const commitDeleteGroups = async (groups: ReturnType<typeof doc>[][]) => {
  let pending: ReturnType<typeof doc>[] = [];
  const send = async () => {
    if (pending.length === 0) return;
    const batch = writeBatch(db);
    pending.forEach((ref) => batch.delete(ref));
    await batch.commit();
    pending = [];
  };
  for (const group of groups) {
    if (pending.length + group.length > DELETE_CHUNK) await send();
    pending.push(...group);
  }
  await send();
};

/**
 * Deletes a goal with everything recorded against it: its contributions, and
 * the transaction each one mirrored onto the Transactions screen.
 *
 * Deleting the goal document alone left the money behind. Its mirrored deposits
 * kept counting as "in goals" on Banks & cash, and kept the Overview balance and
 * the Planner's opening figure low by the same amount — for good, since the only
 * screen that could remove them was the goal that no longer existed.
 *
 * The mirrors are found by `goalId`, which nothing but a contribution's mirror
 * ever carries (see `createContributionWithTransaction`), so every transaction
 * holding this goal's id belongs to it. Both lookups are equality filters on
 * `userId` plus one field, which Firestore answers from its automatic
 * single-field indexes — the same shape as `countCategoryUsage`.
 *
 * Returns what went, so the caller can take the same rows out of its cache.
 */
export const deleteInvestmentGoal = async (userId: string, goalId: string, erase: CoveredErase[] = []) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const ofGoal = (name: string) => query(collection(db, name), where("userId", "==", userId), where("goalId", "==", goalId));
  const [contributions, mirrors, loans] = await Promise.all([getDocs(ofGoal("investmentContributions")), getDocs(ofGoal("transactions")), coveredErasure(userId, goalId, erase)]);

  // The goal last: see `commitDeletes`. A goal with up to ~220 contributions
  // goes in one batch, all or nothing; each loan taken back goes whole, in one
  // batch with the rest of its records (`commitDeleteGroups`).
  await commitDeleteGroups([...loans.groups, ...mirrors.docs.map((d) => [d.ref]), ...contributions.docs.map((d) => [d.ref]), [doc(db, "investmentGoals", goalId)]]);
  const transactionIds = [...mirrors.docs.map((d) => d.id), ...loans.transactionIds];
  await noteDeletions(userId, { transactions: transactionIds, investmentContributions: contributions.docs.map((d) => d.id), investmentGoals: [goalId], debts: loans.debtIds });

  return { contributionIds: contributions.docs.map((d) => d.id), transactionIds, debtIds: loans.debtIds };
};

/**
 * A goal done and its money spent: the records that close it written, then the
 * goal and its contributions deleted — its records in Transactions kept, as
 * the history of what happened to the money. See `closingRecords`.
 *
 * One batch: the closing records never land without the goal going, nor the
 * goal go without them.
 */
export const closeInvestmentGoal = async (userId: string, goalId: string, records: { id: string; data: CreateTransactionDTO }[], erase: CoveredErase[] = []) => {
  requireConnection("delete");
  const [contributions, loans] = await Promise.all([
    getDocs(query(collection(db, "investmentContributions"), where("userId", "==", userId), where("goalId", "==", goalId))),
    coveredErasure(userId, goalId, erase),
  ]);
  const batch = writeBatch(db);
  for (const { id, data } of records) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...data, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const ref of loans.groups.flat()) batch.delete(ref);
  for (const d of contributions.docs) batch.delete(d.ref);
  batch.delete(doc(db, "investmentGoals", goalId));
  await batch.commit();
  await noteDeletions(userId, { investmentContributions: contributions.docs.map((d) => d.id), investmentGoals: [goalId], transactions: loans.transactionIds, debts: loans.debtIds });
  return { contributionIds: contributions.docs.map((d) => d.id), transactionIds: loans.transactionIds, debtIds: loans.debtIds };
};

// ─── INVESTMENT CONTRIBUTIONS ─────────────────────────────────────────────────

// Fetches every contribution for a user in a single query, so goal stats can be
// computed without an N+1 fan-out (one read per goal).
// Read whole once per device, then only what changed — see `syncedList`.
export const getAllContributions = (userId: string) => syncedList<InvestmentContribution>("investmentContributions", userId);

// Atomically writes a contribution AND its mirrored transaction in one batch.
// Either both land or neither does — no orphaned records if one write fails.
export const createContributionWithTransaction = async (
  userId: string,
  contribution: CreateInvestmentContributionDTO,
  transaction: CreateTransactionDTO,
  /** From `newDocId`, when the caller has already shown both rows under them. */
  ids: { contributionId: string; transactionId: string } = { contributionId: newDocId("investmentContributions"), transactionId: newDocId("transactions") },
) => {
  const batch = writeBatch(db);

  const contributionRef = doc(db, "investmentContributions", ids.contributionId);
  batch.set(contributionRef, {
    ...clean({ ...contribution, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const transactionRef = doc(db, "transactions", ids.transactionId);
  batch.set(transactionRef, {
    ...clean({ ...transaction, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { contributionId: contributionRef.id, transactionId: transactionRef.id };
};

/**
 * Someone paid part of a goal for you: the contribution, the debt to them and
 * the expense, in one batch — all three or none.
 *
 * The contribution has no mirror in Transactions on purpose: no money of yours
 * moved, so there is nothing for a card to read. The expense is the cost of
 * what was bought, dated the day they paid; the debt is what you now owe them,
 * and its own money (the loan, written as a record on the card) is written by
 * `syncDebtCash` straight after — where a failure is mended by `useHealDebtCash`
 * the next time the Debts page opens, like every other debt's.
 *
 * Under ids chosen up front, so saving again after a lost answer writes the
 * same three documents rather than three more.
 */
export const createCoveredFunding = async (
  userId: string,
  ids: { contributionId: string; debtId: string; expenseId: string },
  data: { contribution: CreateInvestmentContributionDTO; debt: CreateDebtDTO; expense: CreateTransactionDTO },
) => {
  const stamp = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const batch = writeBatch(db);
  batch.set(doc(db, "investmentContributions", ids.contributionId), { ...clean({ ...data.contribution, userId, debtId: ids.debtId }), ...stamp() });
  batch.set(doc(db, "debts", ids.debtId), { ...clean({ ...data.debt, userId, coveredExpenseId: ids.expenseId }), ...stamp() });
  batch.set(doc(db, "transactions", ids.expenseId), { ...clean({ ...data.expense, userId }), ...stamp() });
  await batch.commit();
  return ids;
};

/**
 * Deletes one contribution and the transaction that mirrors it.
 *
 * Nothing stores which transaction that is, so it is recognised by what the
 * mirror copies from the contribution when both are written: the same `goalId`,
 * the same `contributionType`, the same amount and the same date to the
 * millisecond, on a record flagged `isInvestmentTransaction`. Two deposits
 * identical in all four are interchangeable — either one is the right one to
 * take — so exactly one match is deleted, never all of them.
 *
 * Returns the mirror's id, or `null` when there was none (contributions from
 * before mirroring existed never had one).
 */
export const deleteContribution = async (userId: string, contribution: InvestmentContribution): Promise<{ transactionId: string | null }> => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const candidates = await getDocs(query(collection(db, "transactions"), where("userId", "==", userId), where("goalId", "==", contribution.goalId)));
  const when = firestoreToDate(contribution.date).getTime();
  const mirror = candidates.docs.find((d) => {
    const tx = d.data() as Transaction;
    return (
      tx.isInvestmentTransaction === true &&
      tx.contributionType === contribution.contributionType &&
      tx.amount === contribution.amount &&
      firestoreToDate(tx.date).getTime() === when
    );
  });

  const batch = writeBatch(db);
  batch.delete(doc(db, "investmentContributions", contribution.id));
  if (mirror) batch.delete(mirror.ref);
  await batch.commit();
  await noteDeletions(userId, { investmentContributions: [contribution.id], transactions: mirror ? [mirror.id] : [] });
  return { transactionId: mirror?.id ?? null };
};

// ─── BILLS ────────────────────────────────────────────────────────────────────

/** Read whole once per device, then only what changed — see `syncedList`. */
export const getBills = (userId: string) => syncedList<Bill>("bills", userId);

/** `id` comes from `newDocId` when the caller has already shown the bill under it. */
export const createBill = async (userId: string, data: CreateBillDTO, id: string = newDocId("bills")) => {
  // A new bill with the pause switched off has nothing to store; `null` is only
  // meaningful on an edit, where it means "take the pause away".
  const { pause, startsOn, ...rest } = data;
  await setDoc(doc(db, "bills", id), {
    ...clean({ ...rest, pause: pause ? clean({ ...pause }) : undefined, startsOn: startsOn || undefined, userId, isActive: rest.isActive ?? true }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

export const updateBill = async (billId: string, data: UpdateBillDTO) => {
  // `clean()` drops undefined, which is right for fields the edit did not touch
  // and wrong for a pause that was switched off: leaving it out would leave the
  // old pause in place. `null` is the edit saying so, and becomes a delete.
  const { pause, startsOn, ...rest } = data;
  await updateDoc(doc(db, "bills", billId), {
    ...clean({ ...rest }),
    ...(pause === null ? { pause: deleteField() } : pause ? { pause: clean({ ...pause }) } : {}),
    ...(startsOn === null ? { startsOn: deleteField() } : startsOn ? { startsOn } : {}),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Deletes a bill with every payment recorded against it.
 *
 * Deleting the bill document alone left its payments behind for good: nothing
 * shows a payment without its bill, so no screen could ever remove them. The
 * expenses those payments wrote STAY — they are money that really left, and
 * the balance, the month's spending and the Transactions screen keep counting
 * them as before. They keep their `billId`, which every reader treats as "this
 * was a fixed cost" and nothing follows to a bill (see `useTransactions`: with
 * no payment to find, editing or deleting one touches the expense alone).
 *
 * The payments come from the server, not from this device's copy: one query
 * finds exactly the ones that are there now, so the batch never names one
 * another device already deleted (the rules refuse that and the whole batch
 * with it), and finds any this device has not synced yet. Equality on `userId`
 * plus one field, as `deleteInvestmentGoal`.
 *
 * Returns the payments that went.
 */
export const deleteBill = async (userId: string, billId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const payments = await readAll("billPayments (bill deletion)", query(collection(db, "billPayments"), where("userId", "==", userId), where("billId", "==", billId)));
  const paymentIds = payments.docs.map((d) => d.id);
  // The bill last: see `commitDeletes`. Up to ~450 payments go with it in one batch.
  await commitDeletes([...payments.docs.map((d) => d.ref), doc(db, "bills", billId)]);
  await noteDeletions(userId, { bills: [billId], billPayments: paymentIds });
  return { paymentIds };
};

// ─── BILL PAYMENTS ────────────────────────────────────────────────────────────

/**
 * Read whole once per device, then only what changed — see `syncedList`.
 * Payments written before they carried `updatedAt` came with that first whole
 * read; every write since stamps it, so an old one corrected later is found.
 */
export const getBillPayments = (userId: string) => syncedList<BillPayment>("billPayments", userId);

// Marks a bill paid for a period: writes the payment record AND a mirrored
// expense transaction atomically, so paid bills always show up in expenses.
export const markBillPaid = async (
  userId: string,
  bill: { id: string; name: string; amount: number; categoryId: string },
  periodKey: string,
  paidDate: Date,
  /** Actual amount paid — differs from `bill.amount` for variable bills. */
  paidAmount?: number,
  /** Which instalment of the period this settles. Omitted when there is only one. */
  installmentIndex?: number,
  /** From `newDocId`, when the caller has already shown both rows under them. */
  ids: { paymentId: string; transactionId: string } = { paymentId: newDocId("billPayments"), transactionId: newDocId("transactions") },
  /** The card or cash it was paid from; the expense goes on the main account when absent. */
  accountId?: string,
) => {
  const batch = writeBatch(db);
  const amount = paidAmount ?? bill.amount;

  const transactionRef = doc(db, "transactions", ids.transactionId);
  batch.set(transactionRef, {
    ...clean({
      userId,
      amount,
      type: "expense",
      categoryId: bill.categoryId,
      date: paidDate,
      description: bill.name,
      billId: bill.id,
      accountId,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const paymentRef = doc(db, "billPayments", ids.paymentId);
  const payment: CreateBillPaymentDTO = { billId: bill.id, periodKey, installmentIndex, amount, paidDate, transactionId: transactionRef.id };
  batch.set(paymentRef, {
    ...clean({ ...payment, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { paymentId: paymentRef.id, transactionId: transactionRef.id };
};

// Undoes a payment: removes both the payment record and its expense transaction.
/**
 * Corrects an existing payment — the amount, the date, or both.
 *
 * The mirrored expense is edited in the same batch rather than replaced. Paying
 * €95 when the estimate said €110 is one payment recorded wrongly, not a second
 * payment: writing a new transaction would double the month's spending and
 * leave the original sitting there as a phantom expense.
 */
export const updateBillPayment = async (payment: { id: string; transactionId?: string }, changes: { amount?: number; paidDate?: Date }) => {
  const batch = writeBatch(db);
  const fields = clean(changes);

  batch.update(doc(db, "billPayments", payment.id), { ...fields, updatedAt: serverTimestamp() });

  // An update of a missing document fails the batch as a delete does.
  if (payment.transactionId && (await stillThere("transactions", payment.transactionId))) {
    batch.update(doc(db, "transactions", payment.transactionId), {
      // The transaction calls the same day `date`; the payment calls it `paidDate`.
      ...clean({ amount: changes.amount, date: changes.paidDate }),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
};

/**
 * Marks periods paid that were paid outside the app, writing the payments and
 * nothing else — no transaction.
 *
 * The case: water three months behind on the screen, though the bank paid
 * every one of them. Recording them through `markBillPaid` would write three
 * expenses for money already gone from the account the balance is read from,
 * and push that balance down a second time. A payment with no `transactionId`
 * is the honest record: the period is settled, and nothing left today.
 *
 * One batch, so the months are marked together or not at all; and only online
 * — see `offlinePolicy` — since the list was judged against the screen. Ids
 * come from the caller, who has already shown the rows under them.
 */
export const markBillPeriodsSettled = async (
  userId: string,
  payments: { id: string; billId: string; periodKey: string; installmentIndex?: number; amount: number; paidDate: Date }[],
) => {
  requireConnection("bulk");
  const batch = writeBatch(db);
  for (const { id, ...payment } of payments) {
    const record: CreateBillPaymentDTO = payment;
    batch.set(doc(db, "billPayments", id), { ...clean({ ...record, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
};

export const unmarkBillPaid = async (userId: string, payment: { id: string; transactionId?: string }) => {
  // The expense may be gone already — deleted from the ledger before deleting it
  // took its payment with it. Naming it anyway, the rules refuse the delete and
  // the whole batch with it: the payment came back with an error toast.
  const expenseId = payment.transactionId && (await stillThere("transactions", payment.transactionId)) ? payment.transactionId : undefined;
  const batch = writeBatch(db);
  if (expenseId) batch.delete(doc(db, "transactions", expenseId));
  batch.delete(doc(db, "billPayments", payment.id));
  await batch.commit();
  await noteDeletions(userId, { billPayments: [payment.id], transactions: expenseId ? [expenseId] : [] });
};

/**
 * Whether a document a batch is about to delete or update is still there; one
 * read, for the rare write that names a record another one points at. Unsure
 * (offline, no cached copy) counts as there: the write is then what it was.
 */
export const stillThere = async (collectionName: string, id: string) => {
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    meterRead(collectionName, 1, !!snap.metadata?.fromCache);
    return snap.exists();
  } catch {
    return true;
  }
};

// ─── DEBTS ────────────────────────────────────────────────────────────────────
// Deliberately their own collection rather than transactions with a flag:
// borrowed money is not income, and everything that reads transactions would
// otherwise have to learn to exclude it.

/** Read whole once per device, then only what changed — see `syncedList`. */
export const getDebts = (userId: string) => syncedList<Debt>("debts", userId);

/** As `getDebts`. Repayments written before they carried `updatedAt` came with the first whole read. */
export const getDebtPayments = (userId: string) => syncedList<DebtPayment>("debtPayments", userId);

/**
 * These debts and their repayments, read from the server by id — for a goal's
 * loans this device's list does not hold yet (a goal deleted the moment after
 * someone's payment was recorded, before the debts list caught up). Per debt:
 * one read, plus one query of its repayments (`userId` + `debtId`, automatic
 * indexes). A debt that is not there is simply not returned.
 */
export const getDebtsByIds = async (userId: string, debtIds: string[]): Promise<{ debts: Debt[]; payments: DebtPayment[] }> => {
  const found = await Promise.all(
    debtIds.map(async (id) => {
      const snap = await getDoc(doc(db, "debts", id));
      meterRead("debts", 1, !!snap.metadata?.fromCache);
      if (!snap.exists()) return { debt: undefined, payments: [] as DebtPayment[] };
      const payments = await readAll("debtPayments", query(collection(db, "debtPayments"), where("userId", "==", userId), where("debtId", "==", id)));
      return { debt: { ...(snap.data() as Omit<Debt, "id">), id }, payments: payments.docs.map((d) => ({ ...(d.data() as Omit<DebtPayment, "id">), id: d.id })) };
    }),
  );
  return { debts: found.flatMap((f) => (f.debt ? [f.debt] : [])), payments: found.flatMap((f) => f.payments) };
};

/** `id` comes from `newDocId` when the caller has already shown the debt under it. */
export const createDebt = async (userId: string, data: CreateDebtDTO, id: string = newDocId("debts")) => {
  await setDoc(doc(db, "debts", id), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

export const updateDebt = async (debtId: string, data: UpdateDebtDTO) => {
  // `forgiven: null` takes a forgiveness back; `clean()` would write the null instead.
  const { forgiven, ...rest } = data;
  await updateDoc(doc(db, "debts", debtId), {
    ...clean({ ...rest }),
    ...(forgiven === null ? { forgiven: deleteField() } : forgiven ? { forgiven: clean({ ...forgiven }) } : {}),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Saving the loan form over an existing loan. Unlike `updateDebt`, fields the
 * form now leaves empty are removed rather than kept — see `debtEdit`.
 */
export const editDebt = async (debtId: string, next: CreateDebtDTO) => {
  const { set, clear } = debtEdit(next);
  await updateDoc(doc(db, "debts", debtId), {
    ...cleanTextFields(set),
    ...Object.fromEntries(clear.map((field) => [field, deleteField()])),
    updatedAt: serverTimestamp(),
  });
};

/** Deleting a loan takes its repayments with it — they mean nothing alone. */
export const deleteDebt = async (userId: string, debtId: string, paymentIds: string[]) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const batch = writeBatch(db);
  for (const id of paymentIds) batch.delete(doc(db, "debtPayments", id));
  batch.delete(doc(db, "debts", debtId));
  await batch.commit();
  await noteDeletions(userId, { debtPayments: paymentIds, debts: [debtId] });
};

/** `id` comes from `newDocId` when the caller has already shown the repayment under it. */
export const createDebtPayment = async (userId: string, data: CreateDebtPaymentDTO, id: string = newDocId("debtPayments")) => {
  await setDoc(doc(db, "debtPayments", id), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/** Correcting a repayment typed wrong: the amount, the day, or both. */
/** `accountId: null` takes the card off — a repayment that moved no money. An empty note is taken off too. */
export const updateDebtPayment = async (paymentId: string, data: { amount: number; date: Date; accountId?: string | null; notes?: string | null }) => {
  const account = data.accountId === null ? { accountId: deleteField() } : data.accountId !== undefined ? { accountId: data.accountId } : {};
  const note = data.notes ? cleanText(data.notes) : data.notes;
  const notes = note === undefined ? {} : note ? { notes: note } : { notes: deleteField() };
  await updateDoc(doc(db, "debtPayments", paymentId), { amount: data.amount, date: data.date, ...account, ...notes, updatedAt: serverTimestamp() });
};

export const deleteDebtPayment = async (userId: string, paymentId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  await deleteDoc(doc(db, "debtPayments", paymentId));
  await noteDeleted(userId, "debtPayments", [paymentId]);
};

/**
 * Makes the transactions a debt writes match what it should write — see
 * `debtCashRecords`. Fixed ids, so this is writes only: the wanted ones set
 * again whole, and of the rest, the ones that exist deleted.
 *
 * Only those: the security rules refuse to delete a document that is not
 * there (no owner to check), and one refused delete fails the whole batch. A
 * repayment with no interest has no interest record, so deleting every
 * possible id rejected every such save — the debt saved, its money never
 * written.
 */
export const syncDebtCash = async (
  userId: string,
  records: DebtCashRecord[],
  remove: string[],
  /**
   * Of `remove`, the ones that actually exist — the only ones deleted, and the
   * only ones worth telling other devices about. Most of `remove` is ids that
   * were never written (a repayment with no interest has no interest record).
   */
  existed: string[] = remove,
) => {
  const gone = existed.filter((id) => remove.includes(id));
  if (records.length === 0 && gone.length === 0) return;
  const batch = writeBatch(db);
  for (const { id, ...record } of records) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...record, userId }), updatedAt: serverTimestamp() });
  }
  for (const id of gone) batch.delete(doc(db, "transactions", id));
  await batch.commit();
  // The ids are fixed, so one deleted earlier can be written again now: its
  // deletion comes out of the log, or other devices would drop it.
  await Promise.all([noteRecreated(userId, "transactions", records.map((r) => r.id)), noteDeleted(userId, "transactions", gone)]);
};

// ─── TRANSFERS ────────────────────────────────────────────────────────────────
// Money moved between two of your own accounts — see `features/transactions/transfers`.

/**
 * Writes both halves of a transfer in one batch. A corrected transfer writes
 * the same two documents again under their fixed ids, keeping when the pair
 * was first written.
 */
export const saveTransfer = async (userId: string, records: TransferRecord[], createdAt?: Date) => {
  const batch = writeBatch(db);
  for (const { id, ...record } of records) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...record, userId }), createdAt: createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
};

/** Deletes both halves, and tells the user's other devices — see `noteDeleted`. */
export const deleteTransfer = async (userId: string, transferId: string) => {
  // Not queued: see `offlinePolicy`.
  requireConnection("delete");
  const ids = transferIds(transferId);
  const batch = writeBatch(db);
  batch.delete(doc(db, "transactions", ids.out));
  batch.delete(doc(db, "transactions", ids.in));
  await batch.commit();
  await noteDeleted(userId, "transactions", [ids.out, ids.in]);
};

// ─── DATA RESET ───────────────────────────────────────────────────────────────
// Starting over without losing the account. Deliberately narrower than
// `deleteAllUserData`: the profile and the user's own categories survive, so a
// fresh start doesn't also mean rebuilding the setup that made the app usable.

export interface ResetScope {
  transactions?: boolean;
  /** Bills and their payment history — they only make sense together. */
  bills?: boolean;
  /** Goals and the contributions recorded against them. */
  goals?: boolean;
  budgets?: boolean;
  /** The user's own categories. Off by default; the defaults are never touched. */
  categories?: boolean;
}

/** Which collections each switch clears. */
const RESET_COLLECTIONS: Record<keyof ResetScope, string[]> = {
  transactions: ["transactions"],
  bills: ["bills", "billPayments"],
  goals: ["investmentGoals", "investmentContributions"],
  budgets: ["budgets"],
  categories: ["categories"],
};

/**
 * Deletes the chosen collections for one user and returns how many documents
 * went. Nothing selected deletes nothing — an empty scope is a no-op rather
 * than a silent "everything".
 */
export const resetUserData = async (userId: string, scope: ResetScope): Promise<number> => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const names = (Object.keys(RESET_COLLECTIONS) as (keyof ResetScope)[]).filter((k) => scope[k]).flatMap((k) => RESET_COLLECTIONS[k]);
  if (names.length === 0) return 0;

  const refs = (
    await Promise.all(
      names.map(async (name) => {
        const snap = await getDocs(query(collection(db, name), where("userId", "==", userId)));
        return snap.docs.map((d) => d.ref);
      }),
    )
  ).flat();

  // Firestore allows max 500 writes per batch — commit in chunks
  const CHUNK = 450;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db);
    refs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  // A bulk clear writes no deletion log; every device reads its lists whole instead.
  await noteReset(userId);

  return refs.length;
};

// ─── ACCOUNT DELETION ─────────────────────────────────────────────────────────
// Removes every document belonging to a user before their auth account is
// deleted, so no orphaned personal data is left behind (matches the UI promise
// and privacy expectations). Runs while the user is still authenticated; the
// whole flow, sign-in check first, is `accountDeletion.deleteMyAccount`.

/** What a deletion removed: the first sweep, what later sweeps still found, and whether there was a profile. */
export interface AccountWipe {
  deleted: number;
  leftovers: number;
  profile: boolean;
}

/** Sweeps after the first that may still find something before the deletion gives up and says so. */
const LEFTOVER_SWEEPS = 3;

/** How long the writes this device still has queued get to reach the server first. */
const QUEUED_WRITES_WAIT_MS = 15_000;

/** Every document of the user's in the owned collections, as the server has them now. */
const ownedOnServer = async (userId: string) =>
  (
    await Promise.all(
      OWNED_COLLECTIONS.map(async (name) => {
        // A collection whose rules the owner has not pasted in the console yet
        // refuses every read — and nobody could have written there either, so
        // it holds nothing of the user's. Any other error still stops the deletion.
        const snap = await getDocsFromServer(query(collection(db, name), where("userId", "==", userId))).catch((err: unknown) => {
          if ((err as { code?: string })?.code === "permission-denied") return null;
          throw err;
        });
        if (!snap) return [];
        meterRead(`${name} (account deletion)`, snap.size, false);
        return snap.docs.map((d) => d.ref);
      }),
    )
  ).flat();

/**
 * Deletes everything of the user's in Firestore, the profile last.
 *
 * Closes the write gate first (see `deletionGate`; the caller opens it again if
 * this fails), so nothing in the still-running app can put a document back
 * between the sweep and the end. Writes this device queued earlier are given
 * the chance to land before it — they would otherwise reach the server after
 * the sweep.
 *
 * Then sweeps again until a sweep finds nothing: anything that arrived in the
 * meantime — another device's queued write, a save already on its way — is
 * caught and counted as a leftover. Reads come from the server, never from the
 * device's cache, which could still hold a document deleted elsewhere: named in
 * a batch, that missing document would make the rules refuse the whole batch.
 *
 * The profile is part of every sweep but goes only once the collections are
 * empty, on its own, and only if it is there (the rules refuse deleting a
 * document that is not): with it the account is still whole enough to delete
 * again if anything before it fails. The sweep after it checks the profile
 * too, so one written back in the meantime is caught.
 *
 * What no sweep can close: the gate is per tab. Another tab or the installed
 * app, still open on the same account, can write after the last sweep — even
 * after the sign-in is deleted, for as long as its token lasts (up to an hour).
 * Without Cloud Functions there is nothing on the server to sweep after it.
 *
 * Costs, for an account with N documents: N + 1 reads for the first sweep,
 * 10 for the one that deletes the profile, 10 for the one that finds nothing
 * (an empty query is billed as one read) — N + 21; N + 1 deletes, in batches
 * of 450.
 */
export const deleteAllUserData = async (userId: string): Promise<AccountWipe> => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  beginAccountDeletion(userId);

  let waited: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([waitForPendingWrites(db).catch(() => {}), new Promise<void>((resolve) => (waited = setTimeout(resolve, QUEUED_WRITES_WAIT_MS)))]);
  clearTimeout(waited);

  const wipe: AccountWipe = { deleted: 0, leftovers: 0, profile: false };
  const profile = doc(db, USERS_COLLECTION, userId);
  for (let sweep = 0; ; sweep++) {
    const [refs, profileThere] = await Promise.all([ownedOnServer(userId), getDocFromServer(profile).then((snap) => snap.exists())]);
    if (refs.length === 0 && !profileThere) break;
    if (sweep > LEFTOVER_SWEEPS) {
      const remaining = refs.length + (profileThere ? 1 : 0);
      throw Object.assign(new Error(`Account deletion: ${remaining} documents keep coming back.`), { code: "account/leftovers", remaining });
    }
    if (refs.length > 0) {
      if (sweep === 0) wipe.deleted += refs.length;
      else wipe.leftovers += refs.length;
      await commitDeletes(refs);
      continue;
    }
    // The collections are empty: now the profile.
    await deleteDoc(profile);
    if (wipe.profile) wipe.leftovers += 1;
    wipe.profile = true;
  }

  // Nothing of theirs stays in this device's copy of the lists either.
  await localDeletePrefix(`sync:${userId}:`);
  return wipe;
};

// ─── RECORDS FOR A BANK READING'S DIFFERENCE ─────────────────────────────────
// See `features/accounts/gapRecords`.

/**
 * Writes every record the owner listed for one account's difference in one
 * batch: all of them or none, so the difference never closes by half. Each is
 * the document its own form would write — expenses and incomes, both halves of
 * a transfer, a debt or repayment with the money it moved (written here rather
 * than by the debt's later sync, so nothing is left for a second write to
 * finish). Sets only: nothing here is deleted, so the rules have nothing to
 * refuse.
 */
export const saveGapRecords = async (
  userId: string,
  writes: {
    transactions: { id: string; data: CreateTransactionDTO }[];
    transfers: (TransferRecord & { inReading?: boolean })[];
    debts: { id: string; data: CreateDebtDTO & { inReading?: boolean } }[];
    payments: { id: string; data: CreateDebtPaymentDTO & { inReading?: boolean } }[];
    debtCash: DebtCashRecord[];
  },
) => {
  const batch = writeBatch(db);
  for (const { id, data } of writes.transactions) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...data, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const { id, ...record } of writes.transfers) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...record, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const { id, data } of writes.debts) {
    batch.set(doc(db, "debts", id), { ...clean({ ...data, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const { id, data } of writes.payments) {
    batch.set(doc(db, "debtPayments", id), { ...clean({ ...data, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const { id, ...record } of writes.debtCash) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...record, userId }), updatedAt: serverTimestamp() });
  }
  await batch.commit();
};

// ─── A DEBT THAT PAID PART OF A GOAL ──────────────────────────────────────────

/**
 * Saving the loan form over a debt someone took on to pay part of a goal: the
 * debt, the goal's deposit and the expense, in one batch — see `coveredEdit`
 * for what each is given. Edited apart, the goal kept the old amount and the
 * expense spent money the debt no longer said was borrowed.
 *
 * The deposit and the expense are each read first, and left out unless they
 * are there: updating a missing document fails the whole batch, and the debt's
 * own correction with it. Two reads, only for this kind of debt, only when
 * there is something of theirs to change. Returns which of the two were written.
 */
export const editCoveredDebt = async (
  debtId: string,
  next: CreateDebtDTO,
  covered: {
    contribution?: { id: string; set: { amount?: number; date?: Date; coveredBy?: string; notes?: string } };
    expense?: { id: string; set: { amount?: number; date?: Date; notes?: string } };
    coveredExpenseId?: string;
  },
) => {
  const { set, clear } = debtEdit(next);
  const [contribution, expense] = await Promise.all([
    covered.contribution ? stillThere("investmentContributions", covered.contribution.id) : false,
    covered.expense || covered.coveredExpenseId ? stillThere("transactions", covered.expense?.id ?? covered.coveredExpenseId!) : false,
  ]);
  const batch = writeBatch(db);
  batch.update(doc(db, "debts", debtId), {
    ...cleanTextFields(set),
    ...Object.fromEntries(clear.map((field) => [field, deleteField()])),
    ...(expense && covered.coveredExpenseId ? { coveredExpenseId: covered.coveredExpenseId } : {}),
    updatedAt: serverTimestamp(),
  });
  if (contribution && covered.contribution) batch.update(doc(db, "investmentContributions", covered.contribution.id), { ...clean(covered.contribution.set), updatedAt: serverTimestamp() });
  if (expense && covered.expense) batch.update(doc(db, "transactions", covered.expense.id), { ...clean(covered.expense.set), updatedAt: serverTimestamp() });
  await batch.commit();
  return { contribution: contribution && !!covered.contribution, expense: expense && !!covered.expense };
};

/**
 * Deleting a debt someone took on to pay part of a goal: with it and its
 * repayments go the goal's deposit and the expense — the three said one thing,
 * and left alone the goal would count money nobody paid, and the expense spend
 * it from the main account once the loan's record beside it is gone. Each of
 * the two only if it is there (read first): deleting a missing document fails
 * the whole batch. Returns which of them went.
 */
export const deleteCoveredDebt = async (userId: string, debtId: string, paymentIds: string[], covered: { contributionId?: string; expenseId?: string }) => {
  // Not queued: see `offlinePolicy`, as `deleteDebt`.
  requireConnection("delete");
  const [contribution, expense] = await Promise.all([
    covered.contributionId ? stillThere("investmentContributions", covered.contributionId) : false,
    covered.expenseId ? stillThere("transactions", covered.expenseId) : false,
  ]);
  const batch = writeBatch(db);
  for (const id of paymentIds) batch.delete(doc(db, "debtPayments", id));
  if (contribution) batch.delete(doc(db, "investmentContributions", covered.contributionId!));
  if (expense) batch.delete(doc(db, "transactions", covered.expenseId!));
  batch.delete(doc(db, "debts", debtId));
  await batch.commit();
  await noteDeletions(userId, {
    debtPayments: paymentIds,
    debts: [debtId],
    investmentContributions: contribution ? [covered.contributionId!] : [],
    transactions: expense ? [covered.expenseId!] : [],
  });
  return { contributionId: contribution ? covered.contributionId : undefined, expenseId: expense ? covered.expenseId : undefined };
};
