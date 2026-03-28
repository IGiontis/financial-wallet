import type { User, Transaction, Category, Budget, CreateTransactionDTO, UpdateTransactionDTO, TransactionFilters } from "../types/IndexTypes";
import { createMockCategories } from "../data/mockCategories";
import { createMockTransactions } from "../data/mockTransactions";

/**
 * Mock Data Service
 * Simulates backend API calls with in-memory data
 *
 * IMPORTANT: This service has the SAME interface that the Firebase service will have
 * When we switch to Firebase, we only change the implementation, not the hooks!
 *
 * 2025/2026 Best Practice: Service layer pattern
 * - Components don't know if data is mocked or from Firebase
 * - Easy to test
 * - Easy to swap implementations
 */

// In-memory storage (simulates database)
let mockUser: User | null = null;
let mockCategories: Category[] = [];
let mockTransactions: Transaction[] = [];
let mockBudgets: Budget[] = [];

/**
 * Initialize mock data
 * Call this once when app starts
 */
export function initializeMockData(): void {
  // Create mock user
  mockUser = {
    id: "user_1",
    email: "demo@example.com",
    username: "demo_user",
    firstName: "John",
    lastName: "Doe",
    currency: "USD",
    locale: "en-US",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Create categories
  mockCategories = createMockCategories();

  // Create category ID map for transactions
  const categoryIdMap: Record<string, string> = {};
  mockCategories.forEach((cat) => {
    categoryIdMap[cat.name] = cat.id;
  });

  // Create transactions
  mockTransactions = createMockTransactions(mockUser.id, categoryIdMap);

  console.log("✅ Mock data initialized:", {
    user: mockUser.username,
    categories: mockCategories.length,
    transactions: mockTransactions.length,
  });
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function getCurrentUser(): Promise<User | null> {
  // Simulate network delay
  await delay(300);
  return mockUser;
}

// ============================================================================
// CATEGORY OPERATIONS
// ============================================================================

export async function getCategories(): Promise<Category[]> {
  await delay(200);
  return [...mockCategories];
}

export async function getCategoriesByType(type: "income" | "expense"): Promise<Category[]> {
  await delay(200);
  return mockCategories.filter((cat) => cat.type === type);
}

// ============================================================================
// TRANSACTION OPERATIONS
// ============================================================================

export async function getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  await delay(300);

  let filtered = [...mockTransactions];

  if (filters) {
    if (filters.type) {
      filtered = filtered.filter((t) => t.type === filters.type);
    }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      filtered = filtered.filter((t) => filters.categoryIds!.includes(t.categoryId));
    }
    if (filters.startDate) {
      filtered = filtered.filter((t) => t.date >= filters.startDate!);
    }
    if (filters.endDate) {
      filtered = filtered.filter((t) => t.date <= filters.endDate!);
    }
    if (filters.minAmount !== undefined) {
      filtered = filtered.filter((t) => t.amount >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      filtered = filtered.filter((t) => t.amount <= filters.maxAmount!);
    }
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((t) => t.description.toLowerCase().includes(query) || t.notes?.toLowerCase().includes(query));
    }
  }

  // Sort by date (newest first)
  return filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  await delay(200);
  return mockTransactions.find((t) => t.id === id) || null;
}

export async function createTransaction(data: CreateTransactionDTO): Promise<Transaction> {
  await delay(400);

  const newTransaction: Transaction = {
    id: `txn_${Date.now()}`,
    userId: mockUser!.id,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mockTransactions.push(newTransaction);
  return newTransaction;
}

export async function updateTransaction(id: string, data: UpdateTransactionDTO): Promise<Transaction> {
  await delay(400);

  const index = mockTransactions.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error("Transaction not found");
  }

  mockTransactions[index] = {
    ...mockTransactions[index],
    ...data,
    updatedAt: new Date(),
  };

  return mockTransactions[index];
}

export async function deleteTransaction(id: string): Promise<void> {
  await delay(300);

  const index = mockTransactions.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error("Transaction not found");
  }

  mockTransactions.splice(index, 1);
}

// ============================================================================
// BUDGET OPERATIONS (TODO: Implement when we build budget feature)
// ============================================================================

export async function getBudgets(): Promise<Budget[]> {
  await delay(200);
  return [...mockBudgets];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simulate network delay
 * Makes the mock service feel more realistic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
