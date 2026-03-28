import { subDays, startOfMonth, endOfMonth } from "date-fns";
import type { Transaction } from "../types/IndexTypes";

/**
 * Generate realistic mock transactions for testing
 * Uses date-fns for proper date handling (2025/2026 best practice)
 *
 * @param userId - The user ID to assign to transactions
 * @param categoryIds - Map of category names to their IDs
 * @returns Array of mock transactions
 */
export function createMockTransactions(userId: string, categoryIds: Record<string, string>): Transaction[] {
  const now = new Date();
  const transactions: Transaction[] = [];

  // Helper to create a transaction
  const createTransaction = (description: string, amount: number, type: "income" | "expense", categoryName: string, daysAgo: number, notes?: string): Transaction => ({
    id: `txn_${transactions.length + 1}`,
    userId,
    amount,
    type,
    categoryId: categoryIds[categoryName],
    date: subDays(now, daysAgo),
    description,
    notes,
    createdAt: subDays(now, daysAgo),
    updatedAt: subDays(now, daysAgo),
  });

  // This month's transactions
  transactions.push(
    // Income
    createTransaction("Salary Inc.", 3500, "income", "Salary", 3),
    createTransaction("Freelance Project", 850, "income", "Freelance", 10),

    // Regular expenses
    createTransaction("Amazon", 120.45, "expense", "Shopping", 1),
    createTransaction("Local Grocer", 89.32, "expense", "Groceries", 2),
    createTransaction("Electricity Bill", 145.0, "expense", "Utilities", 5),
    createTransaction("Netflix", 15.99, "expense", "Entertainment", 7),
    createTransaction("Uber", 23.5, "expense", "Transportation", 8),
    createTransaction("Restaurant", 67.8, "expense", "Dining Out", 9),
    createTransaction("Gas Station", 45.0, "expense", "Transportation", 11),
    createTransaction("Grocery Store", 112.45, "expense", "Groceries", 12),
    createTransaction("Doctor Visit", 80.0, "expense", "Healthcare", 14, "Annual checkup"),
    createTransaction("Water Bill", 35.0, "expense", "Utilities", 15),
    createTransaction("Cinema Tickets", 28.0, "expense", "Entertainment", 16),
  );

  // Last month's transactions
  const lastMonthOffset = 30;
  transactions.push(
    createTransaction("Salary Inc.", 3500, "income", "Salary", lastMonthOffset + 3),
    createTransaction("Bonus", 500, "income", "Bonus", lastMonthOffset + 3),
    createTransaction("Amazon", 95.2, "expense", "Shopping", lastMonthOffset + 5),
    createTransaction("Whole Foods", 125.67, "expense", "Groceries", lastMonthOffset + 7),
    createTransaction("Electricity Bill", 138.5, "expense", "Utilities", lastMonthOffset + 10),
    createTransaction("Internet Bill", 65.0, "expense", "Bills", lastMonthOffset + 10),
    createTransaction("Gas Station", 52.3, "expense", "Transportation", lastMonthOffset + 12),
    createTransaction("Restaurant", 89.99, "expense", "Dining Out", lastMonthOffset + 14),
    createTransaction("Gym Membership", 45.0, "expense", "Healthcare", lastMonthOffset + 15),
    createTransaction("Spotify", 9.99, "expense", "Entertainment", lastMonthOffset + 18),
  );

  // Two months ago
  const twoMonthsOffset = 60;
  transactions.push(
    createTransaction("Salary Inc.", 3500, "income", "Salary", twoMonthsOffset + 3),
    createTransaction("Freelance Project", 1200, "income", "Freelance", twoMonthsOffset + 15),
    createTransaction("Target", 156.43, "expense", "Shopping", twoMonthsOffset + 5),
    createTransaction("Trader Joes", 98.21, "expense", "Groceries", twoMonthsOffset + 8),
    createTransaction("Electric Bill", 142.0, "expense", "Utilities", twoMonthsOffset + 10),
    createTransaction("Car Insurance", 125.0, "expense", "Bills", twoMonthsOffset + 12),
  );

  return transactions;
}

/**
 * Calculate total income for a given period
 */
export function calculateTotalIncome(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Calculate total expenses for a given period
 */
export function calculateTotalExpenses(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Get transactions for current month
 */
export function getCurrentMonthTransactions(transactions: Transaction[]): Transaction[] {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  return transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
}
