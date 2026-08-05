import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp, deleteField, writeBatch } from "firebase/firestore";
import { db } from "./config";

import type {
  User,
  CreateUserDTO,
  UpdateUserDTO,
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  Category,
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
  const payment: CreateBillPaymentDTO = { billId: bill.id, periodKey, amount, paidDate, transactionId: transactionRef.id };
  batch.set(paymentRef, {
    ...clean({ ...payment, userId }),
    createdAt: serverTimestamp(),
  });

  await batch.commit();
  return { paymentId: paymentRef.id, transactionId: transactionRef.id };
};

// Undoes a payment: removes both the payment record and its expense transaction.
export const unmarkBillPaid = async (payment: { id: string; transactionId?: string }) => {
  const batch = writeBatch(db);
  if (payment.transactionId) batch.delete(doc(db, "transactions", payment.transactionId));
  batch.delete(doc(db, "billPayments", payment.id));
  await batch.commit();
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
