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
  /**
   * The planner's and the allocation page's own state, kept with the account
   * rather than with the browser.
   *
   * Both screens wrote to `localStorage`, which is per device and per browser: a
   * plan typed on a phone never reached the desktop, and clearing site data
   * threw it away. It is a small object — a salary, a handful of lines, some
   * one-offs — so it sits on the user document rather than in a collection of
   * its own, and needs no security rule that does not already exist. Genuinely
   * per-device preferences (which view a screen was left on, which stacks were
   * collapsed) stay in `localStorage`, where they belong.
   */
  workspace?: Record<string, unknown>;
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
  workspace?: Record<string, unknown>;
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


// ── Debts ────────────────────────────────────────────────────────────────────
// Money lent and borrowed between people, kept apart from transactions on
// purpose: borrowed money is not income and repaying it is not spending, and
// letting either into the totals would wreck every average on the Analytics
// screen. The Planner reads what you owe, because that genuinely has to be
// found from somewhere.

/** Which way the money went. Never inferred from a sign — see `debtsUtils`. */
export type DebtDirection = "owed_by_me" | "owed_to_me";

/**
 * Whether the rate can move under the borrower.
 *
 * Absent means fixed, which is what every loan recorded before this existed was
 * taken to be. A floating loan follows an index — Euribor, or the ECB's own
 * rate — plus a margin the bank sets once and keeps for the life of the loan.
 * The margin is the fixed part; the index is re-read every one, three or six
 * months, and every figure derived from it is true of today and of no other day.
 */
export type DebtRateType = "fixed" | "floating";

export interface Debt {
  id: string;
  userId: string;
  /** Who it is with. Also the grouping key on the list. */
  person: string;
  direction: DebtDirection;
  /** "Δανεικά για ενοίκιο" — optional, since most loans are just money. */
  label?: string;
  /** What was originally handed over, in base currency. */
  amount: number;
  /** When it happened. */
  date: Date;
  /** When it is meant to come back. Most loans between friends have none. */
  dueDate?: Date;
  /**
   * Annual interest, as a percentage. Absent on money lent between people,
   * which is the case this register was built for.
   *
   * Its presence is what makes a debt a loan: with a rate the balance grows
   * between payments, the monthly cost is the bank's instalment rather than the
   * balance divided by the months left, and the total repaid is more than the
   * amount borrowed.
   */
  interestRate?: number;
  /** How many monthly payments the loan runs for. Meaningless without a rate. */
  termMonths?: number;
  /**
   * Months at the start that carry no interest at all.
   *
   * "Άτοκες δόσεις" — the shop's twelve payments, a card's opening offer — and
   * the rate applies only to what is still owed once they run out. Covering the
   * whole term makes it genuinely interest-free; covering part of it lowers the
   * payment, because less of the loan is ever charged for.
   */
  interestFreeMonths?: number;
  /** Fixed for the whole term, or an index that moves. Absent means fixed. */
  rateType?: DebtRateType;
  /**
   * The index a floating loan follows, as last recorded, and the bank's spread
   * over it. `interestRate` stays the all-in rate the two add up to, so that
   * anything reading only that keeps working; these two say where it came from
   * and let the index be updated on its own when it moves.
   */
  baseRate?: number;
  margin?: number;
  /** When the index was last entered. A floating rate read a year ago is a guess. */
  rateReviewedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** One movement against a debt — a repayment, whole or partial. */
export interface DebtPayment {
  id: string;
  userId: string;
  debtId: string;
  amount: number;
  date: Date;
  createdAt: Date;
}

export interface CreateDebtDTO {
  person: string;
  direction: DebtDirection;
  label?: string;
  amount: number;
  date: Date;
  dueDate?: Date;
  /** Annual percentage. Its presence is what makes this a loan rather than an IOU. */
  interestRate?: number;
  termMonths?: number;
  interestFreeMonths?: number;
  rateType?: DebtRateType;
  baseRate?: number;
  margin?: number;
  rateReviewedAt?: Date;
  notes?: string;
}

export interface UpdateDebtDTO {
  person?: string;
  direction?: DebtDirection;
  label?: string;
  amount?: number;
  interestRate?: number;
  termMonths?: number;
  interestFreeMonths?: number;
  rateType?: DebtRateType;
  baseRate?: number;
  margin?: number;
  rateReviewedAt?: Date;
  date?: Date;
  dueDate?: Date;
  notes?: string;
}

export interface CreateDebtPaymentDTO {
  debtId: string;
  amount: number;
  date: Date;
}

export interface DebtWithStatus extends Debt {
  /** Every repayment against it, newest first. */
  payments: DebtPayment[];
  /** Total repaid so far. */
  paid: number;
  /** What is still open. Never negative — an overpayment settles, it does not reverse. */
  remaining: number;
  isSettled: boolean;
}

/** One person's whole position, which is what the list actually shows. */
export interface DebtPerson {
  person: string;
  /** Still open, in each direction. */
  owedByMe: number;
  owedToMe: number;
  /** owedToMe − owedByMe. Positive means you are up with this person. */
  net: number;
  openCount: number;
  debts: DebtWithStatus[];
}
