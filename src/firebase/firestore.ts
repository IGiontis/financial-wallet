import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
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
} from "../shared/types/IndexTypes";

// ─── Helper ───────────────────────────────────────────────────────────────────
// Firestore rejects undefined values — strip them before every write.

const clean = (obj: Record<string, any>) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));

// ─── USERS ────────────────────────────────────────────────────────────────────

export const createUser = async (uid: string, data: CreateUserDTO) => {
  try {
    const currency = data.currency ?? "USD";
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
      ...data,
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
    await updateDoc(doc(db, "transactions", transactionId), {
      ...clean({ ...data }),
      updatedAt: serverTimestamp(),
    });
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

export const getCategories = async (userId: string) => {
  try {
    const [userSnap, defaultSnap] = await Promise.all([
      getDocs(query(collection(db, "categories"), where("userId", "==", userId))),
      getDocs(query(collection(db, "categories"), where("isDefault", "==", true))),
    ]);

    const userCats = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
    const defaultCats = defaultSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);

    // Merge and deduplicate by id
    const all = [...defaultCats, ...userCats];
    return Array.from(new Map(all.map((c) => [c.id, c])).values());
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

export const deleteContribution = async (contributionId: string) => {
  try {
    await deleteDoc(doc(db, "investmentContributions", contributionId));
  } catch (err) {
    throw err;
  }
};
