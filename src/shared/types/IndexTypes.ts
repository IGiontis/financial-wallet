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
  /**
   * Money already in the account when tracking began. Paired with
   * `openingBalanceDate`, which is what keeps it honest: only movements from
   * that day onward change the balance, so backfilling older payments that
   * this figure ALREADY reflects does not subtract them a second time.
   */
  openingBalance?: number;
  /** The day `openingBalance` was true. Undefined when no balance is set. */
  openingBalanceDate?: Date;
  /** Payee list the user maintains for quick pick when adding a transaction. */
  savedPayees?: string[];
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
  savedPayees?: string[];
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
  savedPayees?: string[];
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
  billId?: string; // set when this expense was logged by paying a recurring bill

  // ── Investment transaction flags ──────────────────────────────────────────
  isInvestmentTransaction?: boolean;
  goalId?: string;
  isGoalTransaction?: boolean;
  goalName?: string;
  contributionType?: "deposit" | "withdrawal";
}

export interface CreateTransactionDTO {
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: Date;
  description: string;
  notes?: string;
  isInvestmentTransaction?: boolean;
  metadata?: FuelMetadata;
  goalId?: string;
  goalName?: string;
  isGoalTransaction?: boolean;
  contributionType?: "deposit" | "withdrawal";
  billId?: string;
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
  /**
   * Prefilled into a new transaction when this category is picked, so the
   * common case is amount plus category and nothing else. Both optional: a
   * category with neither simply fills in less.
   */
  defaultPayee?: string;
  defaultAmount?: number;
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
  defaultPayee?: string;
  defaultAmount?: number;
}

export interface UpdateCategoryDTO {
  name?: string;
  icon?: string;
  color?: string;
  defaultPayee?: string;
  defaultAmount?: number;
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
  // ── Carryover fields (recurring goals only) ───────────────────────────────
  arrears?: number; // total unpaid amount accumulated from past periods
  missedMonths?: number; // number of past periods where contribution < target
  periodSurplus?: number; // how much over target was paid in the current period
  periodCredit?: number;
}

// ============================================================================
// BILL TYPES  (recurring / monthly bills the user checks off when paid)
// ============================================================================

export type BillFrequency = "weekly" | "monthly" | "yearly";

export interface Bill {
  id: string;
  userId: string;
  name: string;
  /**
   * Stored in base currency. For a variable bill (see `isVariableAmount`) this
   * is an *estimate* used for forecasting — the real figure is captured on each
   * payment.
   */
  amount: number;
  /** Electricity, water… — the charge differs every period, so ask when paying. */
  isVariableAmount?: boolean;
  categoryId: string; // expense category this is logged under when paid
  frequency: BillFrequency;
  /**
   * Repeat every N periods of `frequency`. 1 = every month/week/year (default),
   * 2 = every 2 months, 3 = quarterly, 4 = every 4 months, etc.
   * Periods are anchored to `anchorDate` (or `createdAt` for older bills).
   */
  intervalCount?: number;
  /** Start of the very first period — anchors every later period bucket. */
  anchorDate?: Date;
  dueDay?: number; // monthly/yearly: day of month (1–31); weekly: weekday (0=Sun … 6=Sat)
  dueMonth?: number; // yearly only: month (0–11)
  /**
   * Days after `dueDay` the bill can still be paid without consequence.
   *
   * Electricity is issued and then payable for another ~25 days; a subscription
   * has none — miss the day and it stops. 0 or undefined means a hard deadline,
   * which is what makes the two cases plannable rather than identical.
   */
  graceDays?: number;
  /**
   * Split each period's total into this many payments, one a month from the
   * due date. 1 or undefined means the whole thing at once.
   *
   * `amount` stays the total for the period — a gym year is €360 whether or not
   * it is taken in three — so forecasts and history keep meaning the same
   * thing, and only what you hand over on the day is divided.
   */
  installmentCount?: number;
  /**
   * Months between instalments. 1 = monthly, 3 = quarterly, 6 = twice a year.
   *
   * Monthly is the common arrangement but far from the only one — insurance is
   * routinely taken every three or six months — so the spacing is stored rather
   * than assumed.
   */
  installmentIntervalMonths?: number;
  notes?: string;
  icon?: string;
  color?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBillDTO {
  name: string;
  amount: number;
  isVariableAmount?: boolean;
  categoryId: string;
  frequency: BillFrequency;
  intervalCount?: number;
  anchorDate?: Date;
  dueDay?: number;
  dueMonth?: number;
  graceDays?: number;
  notes?: string;
  icon?: string;
  color?: string;
  installmentCount?: number;
  installmentIntervalMonths?: number;
}

export interface UpdateBillDTO {
  name?: string;
  amount?: number;
  isVariableAmount?: boolean;
  categoryId?: string;
  frequency?: BillFrequency;
  intervalCount?: number;
  installmentCount?: number;
  installmentIntervalMonths?: number;
  anchorDate?: Date;
  dueDay?: number;
  dueMonth?: number;
  graceDays?: number;
  notes?: string;
  icon?: string;
  color?: string;
  isActive?: boolean;
}

export interface BillPayment {
  id: string;
  userId: string;
  billId: string;
  periodKey: string; // "2026-07" (monthly), "2026-W30" (weekly), "2026" (yearly)
  /** Which instalment of the period this settles, 0-based. Absent means the only one. */
  installmentIndex?: number;
  amount: number;
  paidDate: Date;
  transactionId?: string; // the mirrored expense transaction
  createdAt: Date;
}

export interface CreateBillPaymentDTO {
  billId: string;
  periodKey: string;
  installmentIndex?: number;
  amount: number;
  paidDate: Date;
  transactionId?: string;
}

export interface BillWithStatus extends Bill {
  /** Average of recent real payments — the useful figure for variable bills. */
  averagePaidAmount?: number;
  /** Cheapest/dearest of those same payments, for "usually €80–122". */
  paidAmountRange?: { min: number; max: number };
  currentPeriodKey: string;
  isPaidThisPeriod: boolean;
  /**
   * How many *future* periods are already covered, on top of the current one —
   * the count of consecutive paid periods after this one. 0 for the ordinary
   * case; 1 when next month was settled early.
   */
  paidAheadCount: number;
  payment?: BillPayment; // the payment record for the current period, if paid
  payments: BillPayment[]; // all payments for this bill, newest first (history)
  /** Instalments the period is split into. 1 for an ordinary bill. */
  installmentTotal: number;
  /** How many of them are settled for the current period. */
  installmentsPaid: number;
  /** Which one comes next, 0-based. Absent once the period is fully settled. */
  nextInstallmentIndex?: number;
  /** Still owed on the current period, across every instalment left in it. */
  outstandingAmount: number;
  lastPaidDate?: Date;
  nextDueDate?: Date;
  /** Last day the money must actually be there — `nextDueDate` plus any grace. */
  deadline?: Date;
  monthlyEquivalent: number; // normalized cost per month, for the overview total
}

// ── Fuel types ───────────────────────────────────────────────────────────────

export type FuelType = "petrol" | "diesel" | "lpg" | "cng" | "electric";

export interface FuelMetadata {
  fuelType: FuelType;
  pricePerUnit: number;
  quantity: number;
  totalCost: number;
  odometer?: number;
  place?: string;
}

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

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
