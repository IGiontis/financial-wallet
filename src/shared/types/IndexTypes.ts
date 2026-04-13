// ============================================================================
// SHARED TYPES - Used across multiple features
// Financial Wallet Application
// ============================================================================

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  age?: number;
  country?: string;
  city?: string;
  photoUrl?: string;
  currency: Currency;
  baseCurrency: Currency;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface CreateUserDTO {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  age?: number;
  country?: string;
  city?: string;
  currency?: Currency;
  baseCurrency?: Currency;
  locale?: string;
}

export interface UpdateUserDTO {
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  age?: number;
  country?: string;
  city?: string;
  photoUrl?: string;
  currency?: Currency;
  baseCurrency?: Currency;
  locale?: string;
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: Date;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
  metadata?: FuelMetadata;
  recurringTransactionId?: string;

  // ── Investment transaction flags ──────────────────────────────────────────
  // Set automatically when a deposit/withdrawal is made from the Investments page.
  // These transactions are READ-ONLY in the UI (cannot be edited, only deleted).
  isInvestmentTransaction?: boolean; // true = auto-created from investment contribution
  goalId?: string; // which investment goal this belongs to
  goalName?: string; // goal name stored for display without extra fetches
  contributionType?: "deposit" | "withdrawal"; // direction of the investment
}

export interface CreateTransactionDTO {
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: Date;
  description: string;
  notes?: string;
  // Investment-only fields
  isInvestmentTransaction?: boolean;
  metadata?: FuelMetadata;
  goalId?: string;
  goalName?: string;
  contributionType?: "deposit" | "withdrawal";
}

export interface UpdateTransactionDTO {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  date?: Date;
  description?: string;
  notes?: string;
  metadata?: FuelMetadata;
}

export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  categoryIds?: string[];
  type?: TransactionType;
  minAmount?: number;
  maxAmount?: number;
  searchQuery?: string;
}

// ============================================================================
// CATEGORY TYPES
// ============================================================================

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon?: string;
  color?: string;
  isDefault: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryDTO {
  name: string;
  type: TransactionType;
  icon?: string;
  color?: string;
}

export interface UpdateCategoryDTO {
  name?: string;
  icon?: string;
  color?: string;
}

// ============================================================================
// RECURRING TRANSACTION TYPES
// ============================================================================

export interface RecurringTransaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  description: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  dayOfYear?: string;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  isVariableAmount: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastProcessedDate?: Date;
}

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

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  amount: number;
  month: string;
  type: TransactionType;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetDTO {
  categoryId: string;
  amount: number;
  month: string;
  type: TransactionType;
}

export interface UpdateBudgetDTO {
  amount?: number;
}

export interface BudgetWithActual extends Budget {
  actualAmount: number;
  percentageUsed: number;
  remaining: number;
}

// ============================================================================
// INVESTMENT TYPES
// ============================================================================

export interface InvestmentGoal {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  notes?: string;
  goalType: InvestmentGoalType;
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  deadline?: Date;
  isActive: boolean;
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvestmentGoalDTO {
  name: string;
  icon?: string;
  color?: string;
  notes?: string;
  goalType: InvestmentGoalType;
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  deadline?: Date;
}

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

export interface InvestmentContribution {
  id: string;
  userId: string;
  goalId: string;
  amount: number;
  contributionType: ContributionType;
  date: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvestmentContributionDTO {
  goalId: string;
  amount: number;
  contributionType: ContributionType;
  date: Date;
  notes?: string;
}

export interface UpdateInvestmentContributionDTO {
  date?: Date;
  notes?: string;
}

export interface InvestmentGoalWithStats extends InvestmentGoal {
  totalDeposited: number;
  totalWithdrawn: number;
  totalSaved: number;
  percentageReached?: number;
  remaining?: number;
  monthlyRequired?: number;
  yearlyRequired?: number;
  monthsLeft?: number;
  status?: InvestmentGoalStatus;
  lastContributionDate?: Date;
  contributionCount: number;
  withdrawalCount: number;
  currentPeriodSaved?: number;
}

// ── NEW: add after TransactionType ──────────────────────────────────────────

export type FuelType = "petrol" | "diesel" | "lpg" | "cng" | "electric";

export interface FuelMetadata {
  fuelType: FuelType;
  pricePerUnit: number; // €/L or €/kWh for electric
  quantity: number; // liters or kWh
  totalCost: number; // pricePerUnit × quantity — mirrors transaction.amount
  odometer?: number; // km reading at fill-up (for efficiency charts later)
  place?: string; // e.g. "Shell - Thessaloniki"
}

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

/**
 * Types of transactions.
 * "investment" is a SYSTEM type — auto-created when deposits/withdrawals
 * are made from the Investments page. Users CANNOT manually create investment
 * transactions. They are read-only in the transactions page (delete only).
 */
export type TransactionType = "income" | "expense" | "investment";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type Currency = "USD" | "EUR" | "GBP";

export type InvestmentGoalType = "targeted" | "open_ended";

export type TargetPeriod = "monthly" | "yearly" | "custom";

export type ContributionType = "deposit" | "withdrawal";

export type InvestmentGoalStatus = "on_track" | "behind" | "ahead" | "completed";

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  totalInvestments: number;
  netIncome: number;
  period: DateRange;
}

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  color?: string;
}

export interface InvestmentSummary {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalSavedAllTime: number;
  totalSavedThisPeriod: number;
  goalsOnTrack: number;
  goalsBehind: number;
  period: DateRange;
}
