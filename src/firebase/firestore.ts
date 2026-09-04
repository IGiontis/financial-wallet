import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp, deleteField, writeBatch } from "firebase/firestore";
import { db } from "./config";

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

// ─── Helper ───────────────────────────────────────────────────────────────────
// Firestore rejects undefined values — strip them before every write.

const clean = (obj: Record<string, unknown>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ─── USERS ────────────────────────────────────────────────────────────────────

export const createUser = async (uid: string, data: CreateUserDTO) => {
  const currency = data.currency ?? "EUR";
  await setDoc(doc(db, "users", uid), {
    ...clean({ ...data }),
    id: uid,
    currency, // display currency — can be changed later
    baseCurrency: currency, // base currency — set once, never changes
    locale: data.locale ?? "en-US",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const getUser = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
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

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export const createTransaction = async (userId: string, data: CreateTransactionDTO) => {
  const ref = await addDoc(collection(db, "transactions"), {
    ...clean({ ...data, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getTransactions = async (userId: string) => {
  const q = query(collection(db, "transactions"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
};

export const updateTransaction = async (transactionId: string, data: UpdateTransactionDTO) => {
  const firestoreData = {
    ...clean({ ...data }),
    metadata: data.metadata === undefined ? deleteField() : data.metadata,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, "transactions", transactionId), firestoreData);
};

export const deleteTransaction = async (transactionId: string) => {
  await deleteDoc(doc(db, "transactions", transactionId));
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

// This fixes the duplicate categories issue by deduplicating by name+type
// instead of just id (which fails when seed runs twice creating same name but different id)

export const getCategories = async (userId: string) => {
  const [userSnap, defaultSnap] = await Promise.all([
    getDocs(query(collection(db, "categories"), where("userId", "==", userId))),
    getDocs(query(collection(db, "categories"), where("isDefault", "==", true))),
  ]);

  const userCats = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
  const defaultCats = defaultSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);

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
  const batch = writeBatch(db);
  for (const id of categoryIds) batch.delete(doc(db, "categories", id));
  await batch.commit();
};

export const updateCategory = async (categoryId: string, data: UpdateCategoryDTO) => {
  await updateDoc(doc(db, "categories", categoryId), { ...clean({ ...data }), updatedAt: serverTimestamp() });
};

export const deleteCategory = async (categoryId: string) => {
  await deleteDoc(doc(db, "categories", categoryId));
};

/**
 * How many records point at a category. Deleting one still in use would leave
 * those rows showing a blank category with no way to find them again, so the
 * UI blocks on this count rather than cascading the delete.
 */
export const countCategoryUsage = async (userId: string, categoryId: string): Promise<number> => {
  const [txSnap, billSnap] = await Promise.all([
    getDocs(query(collection(db, "transactions"), where("userId", "==", userId), where("categoryId", "==", categoryId))),
    getDocs(query(collection(db, "bills"), where("userId", "==", userId), where("categoryId", "==", categoryId))),
  ]);
  return txSnap.size + billSnap.size;
};

// ─── INVESTMENT GOALS ─────────────────────────────────────────────────────────

export const createInvestmentGoal = async (userId: string, data: CreateInvestmentGoalDTO, isActive: boolean = true) => {
  // Remove undefined fields — Firestore does not accept undefined
  const cleaned = clean({ ...data, userId, isActive, isCompleted: false });

  const ref = await addDoc(collection(db, "investmentGoals"), {
    ...cleaned,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getInvestmentGoals = async (userId: string) => {
  const q = query(collection(db, "investmentGoals"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentGoal);
};

export const updateInvestmentGoal = async (goalId: string, data: UpdateInvestmentGoalDTO) => {
  const cleaned = clean({ ...data });
  await updateDoc(doc(db, "investmentGoals", goalId), {
    ...cleaned,
    updatedAt: serverTimestamp(),
  });
};

export const deleteInvestmentGoal = async (goalId: string) => {
  await deleteDoc(doc(db, "investmentGoals", goalId));
};

// ─── INVESTMENT CONTRIBUTIONS ─────────────────────────────────────────────────

// Fetches every contribution for a user in a single query, so goal stats can be
// computed without an N+1 fan-out (one read per goal).
export const getAllContributions = async (userId: string) => {
  const q = query(collection(db, "investmentContributions"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentContribution);
};

// Atomically writes a contribution AND its mirrored transaction in one batch.
// Either both land or neither does — no orphaned records if one write fails.
export const createContributionWithTransaction = async (
  userId: string,
  contribution: CreateInvestmentContributionDTO,
  transaction: CreateTransactionDTO,
) => {
  const batch = writeBatch(db);

  const contributionRef = doc(collection(db, "investmentContributions"));
  batch.set(contributionRef, {
    ...clean({ ...contribution, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const transactionRef = doc(collection(db, "transactions"));
  batch.set(transactionRef, {
    ...clean({ ...transaction, userId }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { contributionId: contributionRef.id, transactionId: transactionRef.id };
};

export const deleteContribution = async (contributionId: string) => {
  await deleteDoc(doc(db, "investmentContributions", contributionId));
};

// ─── BILLS ────────────────────────────────────────────────────────────────────

export const getBills = async (userId: string) => {
  const q = query(collection(db, "bills"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bill);
};

export const createBill = async (userId: string, data: CreateBillDTO) => {
  const ref = await addDoc(collection(db, "bills"), {
    ...clean({ ...data, userId, isActive: true }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateBill = async (billId: string, data: UpdateBillDTO) => {
  await updateDoc(doc(db, "bills", billId), {
    ...clean({ ...data }),
    updatedAt: serverTimestamp(),
  });
};

export const deleteBill = async (billId: string) => {
  await deleteDoc(doc(db, "bills", billId));
};

// ─── BILL PAYMENTS ────────────────────────────────────────────────────────────

export const getBillPayments = async (userId: string) => {
  const q = query(collection(db, "billPayments"), where("userId", "==", userId));
  const snap = await getDocs(q);
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
) => {
  const batch = writeBatch(db);
  const amount = paidAmount ?? bill.amount;

  const transactionRef = doc(collection(db, "transactions"));
  batch.set(transactionRef, {
    ...clean({
      userId,
      amount,
      type: "expense",
      categoryId: bill.categoryId,
      date: paidDate,
      description: bill.name,
      billId: bill.id,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const paymentRef = doc(collection(db, "billPayments"));
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

export const unmarkBillPaid = async (payment: { id: string; transactionId?: string }) => {
  const batch = writeBatch(db);
  if (payment.transactionId) batch.delete(doc(db, "transactions", payment.transactionId));
  batch.delete(doc(db, "billPayments", payment.id));
  await batch.commit();
};

// ─── DEBTS ────────────────────────────────────────────────────────────────────
// Deliberately their own collection rather than transactions with a flag:
// borrowed money is not income, and everything that reads transactions would
// otherwise have to learn to exclude it.

export const getDebts = async (userId: string) => {
  const q = query(collection(db, "debts"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Debt);
};

export const getDebtPayments = async (userId: string) => {
  const q = query(collection(db, "debtPayments"), where("userId", "==", userId));
  const snap = await getDocs(q);
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
  await updateDoc(doc(db, "debts", debtId), { ...clean({ ...data }), updatedAt: serverTimestamp() });
};

/** Deleting a loan takes its repayments with it — they mean nothing alone. */
export const deleteDebt = async (debtId: string, paymentIds: string[]) => {
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

export const deleteDebtPayment = async (paymentId: string) => {
  await deleteDoc(doc(db, "debtPayments", paymentId));
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

  return refs.length;
};

// ─── ACCOUNT DELETION ─────────────────────────────────────────────────────────
// Removes every document belonging to a user before their auth account is
// deleted, so no orphaned personal data is left behind (matches the UI promise
// and privacy expectations). Runs while the user is still authenticated.

export const deleteAllUserData = async (userId: string) => {
  // Collections keyed by userId (categories: only the user's own, never defaults)
  const ownedCollections = ["transactions", "investmentGoals", "investmentContributions", "budgets", "categories", "bills", "billPayments"];

  const refs = (
    await Promise.all(
      ownedCollections.map(async (name) => {
        const snap = await getDocs(query(collection(db, name), where("userId", "==", userId)));
        return snap.docs.map((d) => d.ref);
      }),
    )
  ).flat();

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
