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
  CreateCategoryDTO,
  UpdateCategoryDTO,
  Budget,
  CreateBudgetDTO,
  UpdateBudgetDTO,
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

const clean = (obj: Record<string, any>) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));

// ─── USERS ────────────────────────────────────────────────────────────────────

export const createUser = async (uid: string, data: CreateUserDTO) => {
  try {
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
  } catch (err) {
    throw err;
  }
};

export const getUser = async (uid: string) => {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data() as User) : null;
  } catch (err) {
    throw err;
  }
};

export const updateUser = async (uid: string, data: UpdateUserDTO) => {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...clean({ ...data }), // add clean() here
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw err;
  }
};

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export const createTransaction = async (userId: string, data: CreateTransactionDTO) => {
  try {
    const ref = await addDoc(collection(db, "transactions"), {
      ...clean({ ...data, userId }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

export const getTransactions = async (userId: string) => {
  try {
    const q = query(collection(db, "transactions"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
  } catch (err) {
    throw err;
  }
};

export const updateTransaction = async (transactionId: string, data: UpdateTransactionDTO) => {
  try {
    const firestoreData = {
      ...clean({ ...data }),
      metadata: data.metadata === undefined ? deleteField() : data.metadata,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, "transactions", transactionId), firestoreData);
  } catch (err) {
    throw err;
  }
};

export const deleteTransaction = async (transactionId: string) => {
  try {
    await deleteDoc(doc(db, "transactions", transactionId));
  } catch (err) {
    throw err;
  }
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

export const createCategory = async (userId: string, data: CreateCategoryDTO) => {
  try {
    const ref = await addDoc(collection(db, "categories"), {
      ...data,
      userId,
      isDefault: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

// This fixes the duplicate categories issue by deduplicating by name+type
// instead of just id (which fails when seed runs twice creating same name but different id)

export const getCategories = async (userId: string) => {
  try {
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
  } catch (err) {
    throw err;
  }
};

export const updateCategory = async (categoryId: string, data: UpdateCategoryDTO) => {
  try {
    await updateDoc(doc(db, "categories", categoryId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw err;
  }
};

export const deleteCategory = async (categoryId: string) => {
  try {
    await deleteDoc(doc(db, "categories", categoryId));
  } catch (err) {
    throw err;
  }
};

// ─── BUDGETS ──────────────────────────────────────────────────────────────────

export const createBudget = async (userId: string, data: CreateBudgetDTO) => {
  try {
    const ref = await addDoc(collection(db, "budgets"), {
      ...data,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

export const getBudgets = async (userId: string, month: string) => {
  try {
    const q = query(collection(db, "budgets"), where("userId", "==", userId), where("month", "==", month));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Budget);
  } catch (err) {
    throw err;
  }
};

export const updateBudget = async (budgetId: string, data: UpdateBudgetDTO) => {
  try {
    await updateDoc(doc(db, "budgets", budgetId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw err;
  }
};

export const deleteBudget = async (budgetId: string) => {
  try {
    await deleteDoc(doc(db, "budgets", budgetId));
  } catch (err) {
    throw err;
  }
};

// ─── INVESTMENT GOALS ─────────────────────────────────────────────────────────

export const createInvestmentGoal = async (userId: string, data: CreateInvestmentGoalDTO, isActive: boolean = true) => {
  try {
    // Remove undefined fields — Firestore does not accept undefined
    const clean = Object.fromEntries(Object.entries({ ...data, userId, isActive, isCompleted: false }).filter(([_, v]) => v !== undefined));

    const ref = await addDoc(collection(db, "investmentGoals"), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

export const getInvestmentGoals = async (userId: string) => {
  try {
    const q = query(collection(db, "investmentGoals"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentGoal);
  } catch (err) {
    throw err;
  }
};

export const updateInvestmentGoal = async (goalId: string, data: UpdateInvestmentGoalDTO) => {
  try {
    const clean = Object.fromEntries(Object.entries({ ...data }).filter(([_, v]) => v !== undefined));
    await updateDoc(doc(db, "investmentGoals", goalId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw err;
  }
};

export const deleteInvestmentGoal = async (goalId: string) => {
  try {
    await deleteDoc(doc(db, "investmentGoals", goalId));
  } catch (err) {
    throw err;
  }
};

// ─── INVESTMENT CONTRIBUTIONS ─────────────────────────────────────────────────

export const createContribution = async (userId: string, data: CreateInvestmentContributionDTO) => {
  try {
    const clean = Object.fromEntries(Object.entries({ ...data, userId }).filter(([_, v]) => v !== undefined));

    const ref = await addDoc(collection(db, "investmentContributions"), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

export const getContributions = async (goalId: string) => {
  try {
    const q = query(collection(db, "investmentContributions"), where("goalId", "==", goalId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentContribution);
  } catch (err) {
    throw err;
  }
};

// Fetches every contribution for a user in a single query, so goal stats can be
// computed without an N+1 fan-out (one read per goal).
export const getAllContributions = async (userId: string) => {
  try {
    const q = query(collection(db, "investmentContributions"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvestmentContribution);
  } catch (err) {
    throw err;
  }
};

// Atomically writes a contribution AND its mirrored transaction in one batch.
// Either both land or neither does — no orphaned records if one write fails.
export const createContributionWithTransaction = async (
  userId: string,
  contribution: CreateInvestmentContributionDTO,
  transaction: CreateTransactionDTO,
) => {
  try {
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
  } catch (err) {
    throw err;
  }
};

export const deleteContribution = async (contributionId: string) => {
  try {
    await deleteDoc(doc(db, "investmentContributions", contributionId));
  } catch (err) {
    throw err;
  }
};

// ─── BILLS ────────────────────────────────────────────────────────────────────

export const getBills = async (userId: string) => {
  try {
    const q = query(collection(db, "bills"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bill);
  } catch (err) {
    throw err;
  }
};

export const createBill = async (userId: string, data: CreateBillDTO) => {
  try {
    const ref = await addDoc(collection(db, "bills"), {
      ...clean({ ...data, userId, isActive: true }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw err;
  }
};

export const updateBill = async (billId: string, data: UpdateBillDTO) => {
  try {
    await updateDoc(doc(db, "bills", billId), {
      ...clean({ ...data }),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw err;
  }
};

export const deleteBill = async (billId: string) => {
  try {
    await deleteDoc(doc(db, "bills", billId));
  } catch (err) {
    throw err;
  }
};

// ─── BILL PAYMENTS ────────────────────────────────────────────────────────────

export const getBillPayments = async (userId: string) => {
  try {
    const q = query(collection(db, "billPayments"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BillPayment);
  } catch (err) {
    throw err;
  }
};

// Marks a bill paid for a period: writes the payment record AND a mirrored
// expense transaction atomically, so paid bills always show up in expenses.
export const markBillPaid = async (
  userId: string,
  bill: { id: string; name: string; amount: number; categoryId: string },
  periodKey: string,
  paidDate: Date,
) => {
  try {
    const batch = writeBatch(db);

    const transactionRef = doc(collection(db, "transactions"));
    batch.set(transactionRef, {
      ...clean({
        userId,
        amount: bill.amount,
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
    const payment: CreateBillPaymentDTO = { billId: bill.id, periodKey, amount: bill.amount, paidDate, transactionId: transactionRef.id };
    batch.set(paymentRef, {
      ...clean({ ...payment, userId }),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { paymentId: paymentRef.id, transactionId: transactionRef.id };
  } catch (err) {
    throw err;
  }
};

// Undoes a payment: removes both the payment record and its expense transaction.
export const unmarkBillPaid = async (payment: { id: string; transactionId?: string }) => {
  try {
    const batch = writeBatch(db);
    if (payment.transactionId) batch.delete(doc(db, "transactions", payment.transactionId));
    batch.delete(doc(db, "billPayments", payment.id));
    await batch.commit();
  } catch (err) {
    throw err;
  }
};

// ─── ACCOUNT DELETION ─────────────────────────────────────────────────────────
// Removes every document belonging to a user before their auth account is
// deleted, so no orphaned personal data is left behind (matches the UI promise
// and privacy expectations). Runs while the user is still authenticated.

export const deleteAllUserData = async (userId: string) => {
  try {
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
  } catch (err) {
    throw err;
  }
};
