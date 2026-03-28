import type { Category } from "../types/IndexTypes";

/**
 * Default expense categories - available to all users
 * These are pre-defined categories that users can use immediately
 */
export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, "id" | "userId" | "createdAt" | "updatedAt">[] = [
  {
    name: "Shopping",
    type: "expense",
    icon: "🛒",
    color: "#3B82F6",
    isDefault: true,
  },
  {
    name: "Groceries",
    type: "expense",
    icon: "🥗",
    color: "#10B981",
    isDefault: true,
  },
  {
    name: "Bills",
    type: "expense",
    icon: "📄",
    color: "#EF4444",
    isDefault: true,
  },
  {
    name: "Transportation",
    type: "expense",
    icon: "🚗",
    color: "#F59E0B",
    isDefault: true,
  },
  {
    name: "Entertainment",
    type: "expense",
    icon: "🎮",
    color: "#8B5CF6",
    isDefault: true,
  },
  {
    name: "Healthcare",
    type: "expense",
    icon: "🏥",
    color: "#EC4899",
    isDefault: true,
  },
  {
    name: "Dining Out",
    type: "expense",
    icon: "🍽️",
    color: "#F97316",
    isDefault: true,
  },
  {
    name: "Utilities",
    type: "expense",
    icon: "💡",
    color: "#6366F1",
    isDefault: true,
  },
];

/**
 * Default income categories - available to all users
 */
export const DEFAULT_INCOME_CATEGORIES: Omit<Category, "id" | "userId" | "createdAt" | "updatedAt">[] = [
  {
    name: "Salary",
    type: "income",
    icon: "💰",
    color: "#10B981",
    isDefault: true,
  },
  {
    name: "Freelance",
    type: "income",
    icon: "💼",
    color: "#3B82F6",
    isDefault: true,
  },
  {
    name: "Bonus",
    type: "income",
    icon: "🎁",
    color: "#F59E0B",
    isDefault: true,
  },
  {
    name: "Investment",
    type: "income",
    icon: "📈",
    color: "#8B5CF6",
    isDefault: true,
  },
];

/**
 * All default categories combined
 */
export const DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

/**
 * Convert default categories to full Category objects with IDs
 * Used for mock data - in production, Firestore generates IDs
 */
export function createMockCategories(): Category[] {
  const now = new Date();

  return DEFAULT_CATEGORIES.map((category, index) => ({
    ...category,
    id: `cat_${index + 1}`,
    userId: null, // null = default category
    createdAt: now,
    updatedAt: now,
  }));
}
