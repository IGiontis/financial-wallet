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
 *
 * NOTE: Investment contributions are tracked separately in 'investmentContributions'
 * and do NOT create a Transaction record. This keeps financial reporting clean.
 */
export interface Transaction {
  id: string; // Firestore auto-generated ID
  userId: string; // Who owns this transaction

  // CORE TRANSACTION DATA
  amount: number; // Always positive — direction comes from type
  type: TransactionType; // "income" or "expense"
  categoryId: string; // References Category.id
  date: Date; // When transaction occurred
  description: string; // Payee name or memo (e.g., "Amazon", "Salary Inc.")

  // METADATA
  createdAt: Date; // When this record was created
  updatedAt: Date; // Last modification

  // OPTIONAL FIELDS
  notes?: string; // Additional user notes
  recurringTransactionId?: string; // If created from a recurring template
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
 *
 * NOTE: Investment goals have their own name/icon — they do NOT use categories.
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
// INVESTMENT TYPES
// ============================================================================

/**
 * InvestmentGoal entity - stored in Firestore 'investmentGoals' collection
 *
 * Represents a savings goal or open-ended investment pot.
 *
 * TWO MODES:
 *  1. TARGETED  — user wants to reach a specific amount, optionally by a deadline
 *                 e.g. "Save €40,000 for a car by Dec 2031"
 *                 e.g. "Save €3,000 this year" (yearly target, no hard deadline)
 *
 *  2. OPEN_ENDED — no target amount, no deadline, just accumulating money
 *                  e.g. "Emergency Fund" — keep adding, never "done"
 *
 * COMPUTED fields (NOT stored — calculated at query time):
 *  - totalSaved       → sum of all InvestmentContribution.amount for this goal
 *  - percentageReached → totalSaved / targetAmount * 100  (targeted only)
 *  - monthlyRequired  → remaining / monthsLeft  (targeted only, if deadline set)
 *  - status           → on_track | behind | ahead | completed  (targeted only)
 */
export interface InvestmentGoal {
  id: string; // Firestore auto-generated ID
  userId: string; // Who owns this goal

  // IDENTITY
  name: string; // e.g., "New Car", "Emergency Fund", "Japan Trip"
  icon?: string; // Emoji or icon name (e.g., "🚗", "🏖️")
  color?: string; // Hex color for UI card (e.g., "#10B981")
  notes?: string; // Optional description

  // GOAL MODE
  goalType: InvestmentGoalType; // "targeted" | "open_ended"

  // TARGETED GOAL FIELDS (only relevant when goalType === "targeted")
  targetAmount?: number; // How much to save in total (e.g., 40000)
  targetPeriod?: TargetPeriod; // "monthly" | "yearly" | "custom"
  //
  //  targetPeriod explains how the user thinks about the goal:
  //  - "monthly"  → user sets a monthly saving amount; yearly = monthly * 12
  //  - "yearly"   → user sets a yearly saving amount; monthly = yearly / 12
  //  - "custom"   → user sets a total amount with a specific end date (e.g., car in 7 years)
  //
  deadline?: Date; // Optional: when to reach the target
  //   If deadline is set: monthlyRequired = (targetAmount - totalSaved) / monthsLeft
  //   If deadline is NOT set: goal is open-targeted (e.g., "save €3,000/year, no rush")

  // LIFECYCLE
  isActive: boolean; // false = paused / archived
  isCompleted: boolean; // true = target reached (only for targeted goals)
  completedAt?: Date; // When the goal was marked complete

  // METADATA
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data needed to create an investment goal
 */
export interface CreateInvestmentGoalDTO {
  name: string;
  icon?: string;
  color?: string;
  notes?: string;
  goalType: InvestmentGoalType;

  // Only required when goalType === "targeted"
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  deadline?: Date;
}

/**
 * Data for updating an investment goal
 */
export interface UpdateInvestmentGoalDTO {
  name?: string;
  icon?: string;
  color?: string;
  notes?: string;
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  deadline?: Date;
  isActive?: boolean;
  isCompleted?: boolean;
  completedAt?: Date;
}

// ----------------------------------------------------------------------------

/**
 * InvestmentContribution entity - stored in Firestore 'investmentContributions' collection
 *
 * Each time a user adds money to a goal, a contribution record is created.
 * This is how we track "totalSaved" over time and show history.
 *
 * NOTE: Contributions are SEPARATE from Transactions.
 * They do NOT appear in income/expense reports by default.
 * This is an intentional design decision — investments are not "expenses".
 */
export interface InvestmentContribution {
  id: string; // Firestore auto-generated ID
  userId: string; // Who made the contribution
  goalId: string; // Which InvestmentGoal this belongs to

  // CONTRIBUTION DATA
  amount: number; // Always positive — direction comes from contributionType
  contributionType: ContributionType; // "deposit" | "withdrawal"
  date: Date; // When the contribution was made
  notes?: string; // Optional note (e.g., "January savings", "Emergency withdrawal")

  // METADATA
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data needed to create a contribution or withdrawal
 */
export interface CreateInvestmentContributionDTO {
  goalId: string;
  amount: number;
  contributionType: ContributionType; // Must explicitly state deposit or withdrawal
  date: Date;
  notes?: string;
}

/**
 * Data for updating a contribution
 * Amount changes require delete + recreate to keep history clean
 */
export interface UpdateInvestmentContributionDTO {
  date?: Date;
  notes?: string;
}

// ----------------------------------------------------------------------------

/**
 * InvestmentGoal with all computed/aggregated data
 * This is what the UI uses — never stored in Firestore
 *
 * Computed at query time by combining InvestmentGoal + its contributions
 */
export interface InvestmentGoalWithStats extends InvestmentGoal {
  // PROGRESS
  totalDeposited: number; // Sum of all deposit contributions
  totalWithdrawn: number; // Sum of all withdrawal contributions
  totalSaved: number; // totalDeposited - totalWithdrawn (net amount in the goal)

  // TARGETED GOAL COMPUTED FIELDS (undefined for open_ended)
  percentageReached?: number; // totalSaved / targetAmount * 100
  remaining?: number; // targetAmount - totalSaved
  monthlyRequired?: number; // remaining / monthsLeft (only if deadline is set)
  yearlyRequired?: number; // monthlyRequired * 12
  monthsLeft?: number; // Months between today and deadline
  status?: InvestmentGoalStatus; // "on_track" | "behind" | "ahead" | "completed"
  //
  // STATUS LOGIC (±10% tolerance on monthly required):
  //   avgMonthlyContributed = totalSaved / monthsSinceStart
  //   if avgMonthlyContributed >= monthlyRequired * 1.10  → "ahead"
  //   if avgMonthlyContributed >= monthlyRequired * 0.90  → "on_track"
  //   if avgMonthlyContributed <  monthlyRequired * 0.90  → "behind"
  //   if totalSaved >= targetAmount                       → "completed"

  // HISTORY
  lastContributionDate?: Date; // Date of most recent deposit or withdrawal
  contributionCount: number; // Total number of deposits made (not withdrawals)
  withdrawalCount: number; // Total number of withdrawals made
}

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

/**
 * Types of transactions
 * Investment contributions are tracked separately — NOT as transactions
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
 */
export type Currency = "USD" | "EUR" | "GBP";

/**
 * Whether a goal has a fixed target or is open-ended
 */
export type InvestmentGoalType =
  | "targeted" // Has a target amount, optionally a deadline
  | "open_ended"; // No target, no deadline — just keep saving

/**
 * How the user thinks about their saving target
 * Used to compute monthly/yearly breakdowns
 */
export type TargetPeriod =
  | "monthly" // User sets a monthly saving amount (e.g., save €250/month)
  | "yearly" // User sets a yearly saving amount (e.g., save €3,000/year)
  | "custom"; // User sets total + deadline (e.g., €40,000 by Dec 2031)

/**
 * Whether a contribution adds or removes money from a goal
 * Amount is always positive — this field controls direction
 */
export type ContributionType =
  | "deposit" // Adding money to the goal
  | "withdrawal"; // Taking money back out

/**
 * Progress status of a targeted investment goal
 * Computed — never stored
 * Tolerance: ±10% of required monthly amount = "on_track"
 */
export type InvestmentGoalStatus =
  | "on_track" // Savings pace matches required monthly amount
  | "behind" // Savings pace is below required
  | "ahead" // Savings pace is above required
  | "completed"; // Target amount has been reached

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
  totalSaved: number; // Sum of all investment contributions in the period
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

/**
 * Investment summary for overview dashboard
 * Used for the investments section of the dashboard
 */
export interface InvestmentSummary {
  totalGoals: number; // How many goals the user has
  activeGoals: number; // Goals that are active (not paused/completed)
  completedGoals: number; // Goals that reached their target
  totalSavedAllTime: number; // Sum of ALL contributions ever made
  totalSavedThisPeriod: number; // Contributions within a given DateRange
  goalsOnTrack: number; // Targeted goals with status "on_track" or "ahead"
  goalsBehind: number; // Targeted goals with status "behind"
  period: DateRange;
}
