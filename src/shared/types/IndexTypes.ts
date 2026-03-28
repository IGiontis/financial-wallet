// ============================================================================
// SHARED TYPES - Used across multiple features
// Financial Wallet Application
// ============================================================================

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User entity - stored in Firestore 'users' collection
 * Represents an authenticated user of the app
 *
 * IMPORTANT SECURITY NOTES:
 * - Password is NEVER stored here (handled by Firebase Authentication)
 * - Firebase Auth uses email for authentication
 * - Username is stored here for display and alternative login lookup
 */
export interface User {
  // PRIMARY IDENTIFIERS
  id: string; // Firestore auto-generated ID (same as Firebase Auth UID)
  email: string; // User's email (unique, used for Firebase Auth)
  username: string; // User's chosen username (unique, for display and login)

  // PERSONAL INFORMATION
  firstName: string; // Required: User's first name (e.g., "John")
  lastName: string; // Required: User's last name (e.g., "Doe")
  displayName?: string; // Optional: Preferred display name (e.g., "Johnny")

  // OPTIONAL PROFILE DATA
  age?: number; // Optional: User's age
  country?: string; // Optional: Country code (e.g., "US", "GR")
  city?: string; // Optional: City name
  photoUrl?: string; // Optional: Profile picture URL (from Firebase Storage)

  // PREFERENCES
  currency: Currency; // Preferred currency (default: "USD")
  locale: string; // Language preference (default: "en-US")

  // METADATA
  createdAt: Date; // When user registered
  updatedAt: Date; // Last profile update
  lastLoginAt?: Date; // Last successful login timestamp
}

/**
 * Data needed to create a new user account
 * Used during registration/signup
 */
export interface CreateUserDTO {
  // Required fields
  email: string;
  username: string; // Must be unique
  firstName: string;
  lastName: string;

  // Optional fields (can be added later in settings)
  displayName?: string;
  age?: number;
  country?: string;
  city?: string;
  currency?: Currency; // Default: "USD"
  locale?: string; // Default: "en-US"

  // NOTE: Password is NOT here!
  // Password is passed directly to Firebase Auth, never stored in Firestore
}

/**
 * Data for updating user profile
 * All fields optional (update only what changed)
 */
export interface UpdateUserDTO {
  username?: string; // If changed, must check uniqueness
  firstName?: string;
  lastName?: string;
  displayName?: string;
  age?: number;
  country?: string;
  city?: string;
  photoUrl?: string;
  currency?: Currency;
  locale?: string;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction entity - stored in Firestore 'transactions' collection
 * Represents a single financial transaction (income or expense)
 */
export interface Transaction {
  id: string; // Firestore auto-generated ID
  userId: string; // Who owns this transaction

  // CORE TRANSACTION DATA
  amount: number; // Transaction amount (positive for income, negative for expense)
  type: TransactionType; // "income" or "expense"
  categoryId: string; // References Category.id
  date: Date; // When transaction occurred
  description: string; // Payee name or memo (e.g., "Amazon", "Salary Inc.")

  // METADATA
  createdAt: Date; // When this record was created
  updatedAt: Date; // Last modification

  // OPTIONAL FIELDS
  notes?: string; // Additional user notes
  recurringTransactionId?: string; // If created from recurring template
}

/**
 * Data needed to create a new transaction
 * (id, userId, createdAt, updatedAt will be added by system)
 */
export interface CreateTransactionDTO {
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: Date;
  description: string;
  notes?: string;
}

/**
 * Data for updating an existing transaction
 * All fields optional (update only what changed)
 */
export interface UpdateTransactionDTO {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  date?: Date;
  description?: string;
  notes?: string;
}

/**
 * Filters for querying transactions
 * Used in transaction list page
 */
export interface TransactionFilters {
  startDate?: Date; // Filter by date range
  endDate?: Date;
  categoryIds?: string[]; // Filter by categories
  type?: TransactionType; // Filter by type
  minAmount?: number; // Filter by amount range
  maxAmount?: number;
  searchQuery?: string; // Search in description/notes
}

// ============================================================================
// CATEGORY TYPES
// ============================================================================

/**
 * Category entity - stored in Firestore 'categories' collection
 * Represents a transaction category (Shopping, Groceries, Salary, etc.)
 */
export interface Category {
  id: string; // Firestore auto-generated ID
  name: string; // Category name (e.g., "Groceries")
  type: TransactionType; // Is this for income or expense?
  icon?: string; // Icon name or emoji (e.g., "🛒", "💰")
  color?: string; // Hex color for UI (e.g., "#3B82F6")

  // OWNERSHIP
  isDefault: boolean; // true = pre-defined, false = user custom
  userId: string | null; // null = default category, string = user's custom category

  // METADATA
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data needed to create a custom category
 */
export interface CreateCategoryDTO {
  name: string;
  type: TransactionType;
  icon?: string;
  color?: string;
}

/**
 * Data for updating a category
 */
export interface UpdateCategoryDTO {
  name?: string;
  icon?: string;
  color?: string;
}

// ============================================================================
// RECURRING TRANSACTION TYPES
// ============================================================================

/**
 * RecurringTransaction entity - stored in Firestore 'recurringTransactions' collection
 * Template for auto-creating transactions (salary every month, bills, etc.)
 */
export interface RecurringTransaction {
  id: string; // Firestore auto-generated ID
  userId: string; // Who owns this template

  // TEMPLATE DATA (what to create each time)
  amount: number; // Fixed amount or 0 if variable
  type: TransactionType;
  categoryId: string;
  description: string;

  // RECURRENCE RULES
  frequency: RecurrenceFrequency; // "monthly", "yearly", etc.
  dayOfMonth?: number; // e.g., 27 for "27th of each month"
  dayOfYear?: string; // e.g., "01-01" for January 1st

  // LIFECYCLE
  startDate: Date; // When to start creating transactions
  endDate?: Date; // When to stop (undefined = forever)
  isActive: boolean; // Can pause/resume

  // VARIABLE AMOUNT HANDLING
  isVariableAmount: boolean; // true = user must enter amount each time (electricity bill)

  // METADATA
  createdAt: Date;
  updatedAt: Date;
  lastProcessedDate?: Date; // Last time a transaction was auto-created
}

/**
 * Data needed to create a recurring transaction template
 */
export interface CreateRecurringTransactionDTO {
  amount: number;
  type: TransactionType;
  categoryId: string;
  description: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  dayOfYear?: string;
  startDate: Date;
  endDate?: Date;
  isVariableAmount: boolean;
}

/**
 * Data for updating a recurring transaction
 */
export interface UpdateRecurringTransactionDTO {
  amount?: number;
  categoryId?: string;
  description?: string;
  frequency?: RecurrenceFrequency;
  dayOfMonth?: number;
  dayOfYear?: string;
  endDate?: Date;
  isActive?: boolean;
  isVariableAmount?: boolean;
}

// ============================================================================
// BUDGET TYPES
// ============================================================================

/**
 * Budget entity - stored in Firestore 'budgets' collection
 * User's spending/income budget for a specific category and month
 */
export interface Budget {
  id: string; // Firestore auto-generated ID
  userId: string; // Who owns this budget

  // BUDGET DEFINITION
  categoryId: string; // Which category this budget is for
  amount: number; // Budget limit/target amount
  month: string; // Format: "YYYY-MM" (e.g., "2025-03")
  type: TransactionType; // "income" or "expense"

  // METADATA
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data needed to create a budget
 */
export interface CreateBudgetDTO {
  categoryId: string;
  amount: number;
  month: string; // "YYYY-MM"
  type: TransactionType;
}

/**
 * Data for updating a budget
 */
export interface UpdateBudgetDTO {
  amount?: number;
}

/**
 * Budget with actual spending data
 * Used for displaying budget vs actual comparison
 */
export interface BudgetWithActual extends Budget {
  actualAmount: number; // How much was actually spent/earned
  percentageUsed: number; // actualAmount / amount * 100
  remaining: number; // amount - actualAmount
}

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

/**
 * Types of transactions
 * Start with Income/Expense, can add Investment later
 */
export type TransactionType = "income" | "expense";

/**
 * How often a recurring transaction repeats
 */
export type RecurrenceFrequency =
  | "daily" // Every day
  | "weekly" // Every week
  | "monthly" // Every month (most common)
  | "yearly"; // Every year

/**
 * Supported currencies
 * Start with major currencies, add more as needed
 */
export type Currency = "USD" | "EUR" | "GBP";

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Date range for filtering transactions, charts, etc.
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Generic API response wrapper
 * Used by TanStack Query for loading states
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Chart data point for graphs
 * Used in overview dashboard
 */
export interface ChartDataPoint {
  label: string; // X-axis label (date, category name, etc.)
  value: number; // Y-axis value
  color?: string; // Optional color for the data point
}

/**
 * Summary statistics for overview dashboard
 */
export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number; // totalIncome - totalExpenses
  period: DateRange;
}

/**
 * Category spending summary
 * Used for pie charts and category breakdowns
 */
export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number; // Of total spending/income
  transactionCount: number;
  color?: string;
}
