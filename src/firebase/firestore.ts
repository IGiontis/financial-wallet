import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, getCountFromServer, addDoc, serverTimestamp, deleteField, writeBatch, type Query } from "firebase/firestore";
import { db } from "./config";
import { noteDeleted, noteRecreated, noteReset, syncedList } from "./syncList";
import { meterRead } from "../lib/readMeter";
import { localGet, localSet } from "../lib/localStore";
import { requireConnection } from "../shared/utils/offlinePolicy";
import { debtEdit } from "../features/debts/debtsUtils";
import { firestoreToDate } from "../shared/utils/dates";

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
// Firestore rejects undefined values — strip them before every write.

const clean = (obj: Record<string, unknown>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

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
 * Sets or clears the starting balance.
 *
 * Clearing needs `deleteField()` rather than `undefined`: `clean()` drops
 * undefined keys, so passing one would leave the old figure sitting in the
 * document while the form showed the box as empty — and the balance would go
 * on quietly counting from a number the user thought they had removed.
 *
 * The two fields always move together. An amount with no date would count every
 * backfilled record against it, which is the double-subtraction the pairing
 * exists to prevent.
 */
export const setOpeningBalance = async (uid: string, opening: { amount: number; date: Date } | null) => {
  await updateDoc(doc(db, "users", uid), {
    openingBalance: opening ? opening.amount : deleteField(),
    openingBalanceDate: opening ? opening.date : deleteField(),
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
  await updateDoc(doc(db, "users", uid), { [`workspace.${key}`]: value, updatedAt: serverTimestamp() });
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
  if (paymentId) return [paymentId];
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
  for (const id of paymentIds) batch.update(doc(db, "billPayments", id), paymentChanges);
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
  await noteDeleted(userId, "transactions", [transactionId]);
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

export const getCategories = async (userId: string) => {
  const [userSnap, defaultCats] = await Promise.all([readAll("categories (own)", query(collection(db, "categories"), where("userId", "==", userId))), getDefaultCategories()]);

  const userCats = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);

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
export const createCategories = async (userId: string, data: Omit<CreateCategoryDTO, "type">, types: TransactionType[]): Promise<Record<string, string>> => {
  const batch = writeBatch(db);
  const created: Record<string, string> = {};

  for (const type of types) {
    const ref = doc(collection(db, "categories"));
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

/**
 * Renames or restyles every document in a "both" pair at once.
 *
 * The autofill defaults are written with `deleteField()` when blank rather than
 * dropped by `clean()`: emptying the payee box has to actually remove the
 * stored value, or the category would go on prefilling a name the user just
 * cleared, with the form showing the field as empty.
 */
export const updateCategories = async (categoryIds: string[], data: UpdateCategoryDTO) => {
  const { defaultPayee, defaultAmount, ...rest } = data;
  const batch = writeBatch(db);

  for (const id of categoryIds) {
    batch.update(doc(db, "categories", id), {
      ...clean({ ...rest }),
      defaultPayee: defaultPayee ?? deleteField(),
      defaultAmount: defaultAmount ?? deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
};

/** Removes a whole pair, so "both" never half-disappears either. */
export const deleteCategories = async (categoryIds: string[]) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const batch = writeBatch(db);
  for (const id of categoryIds) batch.delete(doc(db, "categories", id));
  await batch.commit();
};

export const updateCategory = async (categoryId: string, data: UpdateCategoryDTO) => {
  await updateDoc(doc(db, "categories", categoryId), { ...clean({ ...data }), updatedAt: serverTimestamp() });
};

export const deleteCategory = async (categoryId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  await deleteDoc(doc(db, "categories", categoryId));
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

export const getInvestmentGoals = async (userId: string) => {
  const q = query(collection(db, "investmentGoals"), where("userId", "==", userId));
  const snap = await readAll("investmentGoals", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentGoal);
};

export const updateInvestmentGoal = async (goalId: string, data: UpdateInvestmentGoalDTO) => {
  const cleaned = clean({ ...data });
  await updateDoc(doc(db, "investmentGoals", goalId), {
    ...cleaned,
    // Taken off: `clean()` would drop a null, and the old date would stay.
    ...(data.planFrom === null ? { planFrom: deleteField() } : {}),
    updatedAt: serverTimestamp(),
  });
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
export const deleteInvestmentGoal = async (userId: string, goalId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const ofGoal = (name: string) => query(collection(db, name), where("userId", "==", userId), where("goalId", "==", goalId));
  const [contributions, mirrors] = await Promise.all([getDocs(ofGoal("investmentContributions")), getDocs(ofGoal("transactions"))]);

  // The goal last: see `commitDeletes`. A goal with up to ~220 contributions
  // goes in one batch, all or nothing.
  await commitDeletes([...mirrors.docs.map((d) => d.ref), ...contributions.docs.map((d) => d.ref), doc(db, "investmentGoals", goalId)]);
  await noteDeleted(userId, "transactions", mirrors.docs.map((d) => d.id));

  return { contributionIds: contributions.docs.map((d) => d.id), transactionIds: mirrors.docs.map((d) => d.id) };
};

/**
 * A goal done and its money spent: the records that close it written, then the
 * goal and its contributions deleted — its records in Transactions kept, as
 * the history of what happened to the money. See `closingRecords`.
 *
 * One batch: the closing records never land without the goal going, nor the
 * goal go without them.
 */
export const closeInvestmentGoal = async (userId: string, goalId: string, records: { id: string; data: CreateTransactionDTO }[]) => {
  requireConnection("delete");
  const contributions = await getDocs(query(collection(db, "investmentContributions"), where("userId", "==", userId), where("goalId", "==", goalId)));
  const batch = writeBatch(db);
  for (const { id, data } of records) {
    batch.set(doc(db, "transactions", id), { ...clean({ ...data, userId }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  for (const d of contributions.docs) batch.delete(d.ref);
  batch.delete(doc(db, "investmentGoals", goalId));
  await batch.commit();
  return { contributionIds: contributions.docs.map((d) => d.id) };
};

// ─── INVESTMENT CONTRIBUTIONS ─────────────────────────────────────────────────

// Fetches every contribution for a user in a single query, so goal stats can be
// computed without an N+1 fan-out (one read per goal).
export const getAllContributions = async (userId: string) => {
  const q = query(collection(db, "investmentContributions"), where("userId", "==", userId));
  const snap = await readAll("investmentContributions", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentContribution);
};

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
  batch.set(doc(db, "debts", ids.debtId), { ...clean({ ...data.debt, userId }), ...stamp() });
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
  if (mirror) await noteDeleted(userId, "transactions", [mirror.id]);
  return { transactionId: mirror?.id ?? null };
};

// ─── BILLS ────────────────────────────────────────────────────────────────────

export const getBills = async (userId: string) => {
  const q = query(collection(db, "bills"), where("userId", "==", userId));
  const snap = await readAll("bills", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bill);
};

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

export const deleteBill = async (billId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  await deleteDoc(doc(db, "bills", billId));
};

// ─── BILL PAYMENTS ────────────────────────────────────────────────────────────

export const getBillPayments = async (userId: string) => {
  const q = query(collection(db, "billPayments"), where("userId", "==", userId));
  const snap = await readAll("billPayments", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BillPayment);
};

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

  batch.update(doc(db, "billPayments", payment.id), fields);

  if (payment.transactionId) {
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
    batch.set(doc(db, "billPayments", id), { ...clean({ ...record, userId }), createdAt: serverTimestamp() });
  }
  await batch.commit();
};

export const unmarkBillPaid = async (userId: string, payment: { id: string; transactionId?: string }) => {
  const batch = writeBatch(db);
  if (payment.transactionId) batch.delete(doc(db, "transactions", payment.transactionId));
  batch.delete(doc(db, "billPayments", payment.id));
  await batch.commit();
  if (payment.transactionId) await noteDeleted(userId, "transactions", [payment.transactionId]);
};

// ─── DEBTS ────────────────────────────────────────────────────────────────────
// Deliberately their own collection rather than transactions with a flag:
// borrowed money is not income, and everything that reads transactions would
// otherwise have to learn to exclude it.

export const getDebts = async (userId: string) => {
  const q = query(collection(db, "debts"), where("userId", "==", userId));
  const snap = await readAll("debts", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Debt);
};

export const getDebtPayments = async (userId: string) => {
  const q = query(collection(db, "debtPayments"), where("userId", "==", userId));
  const snap = await readAll("debtPayments", q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DebtPayment);
};

export const createDebt = async (userId: string, data: CreateDebtDTO) => {
  const ref = await addDoc(collection(db, "debts"), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
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
    ...set,
    ...Object.fromEntries(clear.map((field) => [field, deleteField()])),
    updatedAt: serverTimestamp(),
  });
};

/** Deleting a loan takes its repayments with it — they mean nothing alone. */
export const deleteDebt = async (debtId: string, paymentIds: string[]) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  const batch = writeBatch(db);
  for (const id of paymentIds) batch.delete(doc(db, "debtPayments", id));
  batch.delete(doc(db, "debts", debtId));
  await batch.commit();
};

export const createDebtPayment = async (userId: string, data: CreateDebtPaymentDTO) => {
  const ref = await addDoc(collection(db, "debtPayments"), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

/** Correcting a repayment typed wrong: the amount, the day, or both. */
/** `accountId: null` takes the card off — a repayment that moved no money. An empty note is taken off too. */
export const updateDebtPayment = async (paymentId: string, data: { amount: number; date: Date; accountId?: string | null; notes?: string | null }) => {
  const account = data.accountId === null ? { accountId: deleteField() } : data.accountId !== undefined ? { accountId: data.accountId } : {};
  const notes = data.notes === undefined ? {} : data.notes ? { notes: data.notes } : { notes: deleteField() };
  await updateDoc(doc(db, "debtPayments", paymentId), { amount: data.amount, date: data.date, ...account, ...notes });
};

export const deleteDebtPayment = async (paymentId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  await deleteDoc(doc(db, "debtPayments", paymentId));
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
// and privacy expectations). Runs while the user is still authenticated.

export const deleteAllUserData = async (userId: string) => {
  // Not queued: see `offlinePolicy`. A deletion decided against an offline
  // copy of the account is the one write with nothing to undo it.
  requireConnection("delete");
  // Collections keyed by userId (categories: only the user's own, never defaults).
  // Debts and their repayments are the other person's name and what you owe
  // them — as personal as anything here, so they go too.
  const ownedCollections = ["transactions", "investmentGoals", "investmentContributions", "budgets", "categories", "bills", "billPayments", "debts", "debtPayments"];

  const refs = (
    await Promise.all(
      ownedCollections.map(async (name) => {
        const snap = await getDocs(query(collection(db, name), where("userId", "==", userId)));
        return snap.docs.map((d) => d.ref);
      }),
    )
  ).flat();

  // Nothing of theirs stays in this device's store either.
  await noteReset(userId);

  // Include the user profile document itself
  refs.push(doc(db, "users", userId));

  // Firestore allows max 500 writes per batch — commit in chunks
  const CHUNK = 450;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db);
    refs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};
