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
  // `openingBalance` / `openingBalanceDate` («Αρχικό υπόλοιπο» in Settings) may
  // still sit on older documents. They are no longer read or written: the bank
  // and cash readings are where the money is counted from. Left in place, not
  // deleted — nothing reads them, and a delete would be a write per account.
  /**
   * The planner's own state, kept with the account
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

/**
 * An update DTO's fields: undefined = not touched, `null` = cleared by the
 * user (the field is deleted — `forUpdate` in firebase/firestore.ts).
 */
export interface UpdateUserDTO {
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  age?: number | null;
  country?: string | null;
  city?: string | null;
  photoUrl?: string | null;
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
  /**
   * Set when this income was logged with «Ήρθε» on the Incomes page — the
   * mirror of `billId`. The record is the proof that the income came, so
   * deleting it takes the «Ήρθε» back everywhere with it.
   */
  incomeId?: string;
  /**
   * The day that income was expected, "YYYY-MM-DD". Ties the record to one
   * occurrence (`income:{id}:{incomeDue}`), so an October salary paid on 28
   * September counts for October, and nothing has to guess which time it was.
   */
  incomeDue?: string;
  /**
   * Already inside the bank reading taken on its own day. Only ever set when
   * answering «Ήταν ήδη στην τράπεζα;» with a date equal to the reading's: the
   * record is written after the reading, so without this it would be counted
   * on top of a balance that already holds it. See `isAfterReading`.
   */
  inReading?: boolean;
  /** Which of the Banks & cash accounts it came out of or went into. Optional — see `AccountPicker`. */
  accountId?: string;
  /**
   * Written by a loan, not typed: the money a debt moved through a card. Set
   * with `debtPart`, and kept in step with the debt by `syncDebtCash` — it is
   * changed and deleted on «Χρέη & δάνεια», never here.
   */
  debtId?: string;
  /** The repayment it is part of, for "principal" and "interest". */
  debtPaymentId?: string;
  /**
   * "loan": the money borrowed or lent; "principal": the part of a repayment
   * that came off the debt — both a transfer, not income or spending.
   * "interest": what a repayment paid for the loan, which is spending (or, on
   * money lent, income). See `isDebtTransfer`.
   */
  debtPart?: DebtCashPart;
  /**
   * Its debt was deleted from «Αρχείο» and the money kept (owner, 2026-11-17):
   * an ordinary record now — not locked to a debt (`recordLock`), never
   * rewritten or removed by the debt sync (`debtCashDrift`) — and still counted
   * as a debt's money (`debtId`, `debtPart` stay), so nothing it added up to moves.
   */
  debtKept?: boolean;
  /**
   * One half of a move between two of your own accounts — 200 from Revolut to
   * cash. Written in pairs under one id: the "out" half an expense on the
   * account it left, the "in" half an income on the account it reached. The
   * pair changes where the money is and nothing else, so neither half is
   * income or spending — see `isMoneyMove`. Changed and deleted as a pair.
   */
  transferId?: string;
  transferPart?: "out" | "in";

  // ── Investment transaction flags ──────────────────────────────────────────
  isInvestmentTransaction?: boolean;
  goalId?: string;
  isGoalTransaction?: boolean;
  goalName?: string;
  contributionType?: "deposit" | "withdrawal";
  /**
   * A goal's money handed to someone to keep — the friend booking the trip.
   * It has left your banks (the card it left goes down) but is still the
   * goal's, not spent. Absent: the goal's money sits in your own bank, set
   * aside. See `goalHeldDelta`.
   */
  heldBy?: string;
  /**
   * Written by a «Κλείσιμο ημέρας» on the «Δουλειά» page: the day's profit
   * coming into a card or cash (an income), or its loss covered from one (an
   * expense). The closing (`BusinessEntry`) names this record back through
   * `linkedTransactionId`; the two are written, changed and deleted together,
   * from the «Δουλειά» page only. Filed under no category of the user's: its
   * `categoryId` is `BUSINESS_CATEGORY_ID`, shown as «Δουλειά».
   */
  businessEntryId?: string;
  /** The business that closing belongs to — how deleting a business finds its records. */
  businessId?: string;
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
  /** See `Transaction.incomeId`, `incomeDue` and `inReading`. */
  incomeId?: string;
  incomeDue?: string;
  inReading?: boolean;
  accountId?: string;
  /** See `Transaction.heldBy`. */
  heldBy?: string;
  /** See `Transaction.businessEntryId` and `businessId`. */
  businessEntryId?: string;
  businessId?: string;
}

export interface UpdateTransactionDTO {
  amount?: number;
  type?: TransactionType;
  categoryId?: string;
  date?: Date;
  description?: string;
  /** `null` takes it off (cleared in the form); absent leaves it as it is. */
  notes?: string | null;
  /** Always spoken for by the edit form: absent takes the fuel details off. */
  metadata?: FuelMetadata;
  /** `null` takes it off; absent leaves it as it is. */
  accountId?: string | null;
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
  /** `null` takes it off. */
  icon?: string | null;
  color?: string | null;
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

/**
 * One part of a goal — «Σπίτι 150–200» of a ski trip — when the goal is built
 * from what each thing roughly costs instead of one figure. The goal's target
 * is the parts' `max` added up; see `goalParts`.
 */
export interface GoalPart {
  id: string;
  label: string;
  min: number;
  max: number;
}

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
  /**
   * "YYYY-MM-DD": the day the owner means to start putting money in. Read by
   * the Planner only — it asks nothing of the goal before that month, and
   * spreads what is left from then to the deadline. Money can still go in
   * earlier; it simply is not planned for.
   */
  planFrom?: string;
  /** What the target is made of, in the order they fill. Absent: one figure. */
  parts?: GoalPart[];
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
  /** See `InvestmentGoal.planFrom`. */
  planFrom?: string;
  parts?: GoalPart[];
}

export interface UpdateInvestmentGoalDTO {
  name?: string;
  /** `null` takes it off (cleared in the form); absent leaves it as it is. */
  icon?: string | null;
  color?: string | null;
  notes?: string | null;
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  deadline?: Date | null;
  /** See `InvestmentGoal.planFrom`. `null` takes it off. */
  planFrom?: string | null;
  /** `null` takes them off: back to one figure. */
  parts?: GoalPart[] | null;
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
  accountId?: string;
  /** See `Transaction.heldBy`. */
  heldBy?: string;
  /** See `CreateInvestmentContributionDTO.coveredBy`. */
  coveredBy?: string;
  debtId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvestmentContributionDTO {
  goalId: string;
  amount: number;
  contributionType: ContributionType;
  date: Date;
  notes?: string;
  /**
   * The card: for a savings goal, the bank the money is kept in (its balance
   * does not change); for an investment, the one it left or came back into.
   * Absent for the main account, as on any transaction.
   */
  accountId?: string;
  /** Handed to this person to keep for the goal — see `Transaction.heldBy`. */
  heldBy?: string;
  /**
   * This person paid it for you: the contribution counts toward the goal, but no
   * money of yours moved and it has no mirror in Transactions — the expense and
   * the debt were written beside it (see `createCoveredFunding`).
   */
  coveredBy?: string;
  /** The debt to `coveredBy` that came with it. */
  debtId?: string;
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
  /**
   * What other people paid toward it, by person: part of `totalSaved` but never
   * in your bank, nor held by anyone — see `goalHolding`. Absent when nobody did.
   */
  covered?: { person: string; amount: number; debtIds: string[] }[];
  totalCovered?: number;
}

// ============================================================================
// BILL TYPES  (recurring / monthly bills the user checks off when paid)
// ============================================================================

export type BillFrequency = "weekly" | "monthly" | "yearly";

/**
 * A stretch when a bill is not charged: the holiday house over the winter, the
 * flat that was left behind.
 *
 * Months, in the planner's own "YYYY-MM" shape, because that is the grain these
 * decisions are made at — electricity is cut for the winter, not from the 14th.
 * The three cases are one idea with two dials: whether it comes back (`to`), and
 * whether it comes back every year (`yearly`).
 */
export interface BillPause {
  /** First month not charged, "YYYY-MM". */
  from: string;
  /** Last month not charged, inclusive. Absent: it does not come back. */
  to?: string;
  /** Off over the same months every year, beginning with `from`. Needs `to`. */
  yearly?: boolean;
}

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
  /** When it is not charged. See `BillPause`. */
  pause?: BillPause;
  /**
   * "YYYY-MM": the first month it is charged. Nothing before it is owed — a tax
   * added in October that starts next year is not "unpaid for this year".
   * Absent: charged from when it was added, as before. See `isPausedOn`.
   */
  startsOn?: string;
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
  /** `null` from an edit that left yearly — see `updateBill`. */
  dueMonth?: number | null;
  graceDays?: number;
  /** `null` from an edit that cleared it — see `updateBill`. */
  notes?: string | null;
  icon?: string;
  color?: string;
  installmentCount?: number;
  installmentIntervalMonths?: number;
  /** `null` from an edit that switched the pause off — see `updateBill`. */
  pause?: BillPause | null;
  /** See `Bill.startsOn`. `null` from an edit that cleared it. */
  startsOn?: string | null;
  /** Switched off: kept, counted nowhere. On unless said. */
  isActive?: boolean;
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
  /** `null` clears it (the bill is no longer yearly). */
  dueMonth?: number | null;
  graceDays?: number;
  /** `null` clears it. */
  notes?: string | null;
  icon?: string | null;
  color?: string | null;
  isActive?: boolean;
  /** `null` clears it. */
  pause?: BillPause | null;
  /** See `Bill.startsOn`. `null` clears it. */
  startsOn?: string | null;
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
  /**
   * A CLEARING bill («εκκαθαριστικός», owner 2026-11-26): this payment settled
   * several periods with one figure — water left for three months, then one
   * final bill. It carries the whole amount and the one expense; these are the
   * ids of the other periods' rows it settled, each with `coveredBy` set and
   * an amount of 0. Deleting this payment takes them with it.
   */
  covers?: string[];
  /**
   * Settled by a clearing bill — the id of that payment. Such a row has
   * amount 0 and no expense: the money left once, in the clearing. It keeps
   * the period settled, and is left out of averages (see `averagePaidAmount`).
   */
  coveredBy?: string;
  createdAt: Date;
}

export interface CreateBillPaymentDTO {
  billId: string;
  periodKey: string;
  installmentIndex?: number;
  amount: number;
  paidDate: Date;
  transactionId?: string;
  covers?: string[];
  coveredBy?: string;
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

/**
 * A debt let go of: what was still owed, forgiven on a day, and why. The debt
 * stays, with its history — "there was a loan, 300 of it was paid, the rest was
 * let go" — rather than being deleted as if it never happened. No money moves:
 * nothing was paid and nothing received.
 */
export interface DebtForgiveness {
  date: Date;
  /** What was still owed when it was forgiven. */
  amount: number;
  note?: string;
  /**
   * Not forgiven but called off: what it paid for was cancelled and the money
   * went back to the one who lent it — the hotel refunded the friend who paid
   * it. Settled the same way; said «Ακυρώθηκε», not «Χαρίστηκε».
   */
  refund?: boolean;
}

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
  /**
   * Where the money went or came from — a card, cash, or "" for no particular
   * one (the main account). Its presence is what makes a debt move money: one
   * saved before this existed has none, and moves nothing, as it always did.
   */
  accountId?: string;
  /** The goal this debt paid for a part of, if it did — see `InvestmentContribution.coveredBy`. */
  forGoalId?: string;
  /**
   * The expense written with this debt when someone paid part of a goal (see
   * `createCoveredFunding`) — so calling it off can take that expense back.
   */
  coveredExpenseId?: string;
  /** Let go of — see `DebtForgiveness`. Nothing is owed from its date on. */
  forgiven?: DebtForgiveness;
  /** Written from a bank reading on the reading's own day; its money carries it — see `Transaction.inReading`. */
  inReading?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Which part of a debt's money a transaction is — see `Transaction.debtPart`. */
export type DebtCashPart = "loan" | "principal" | "interest";

/** One movement against a debt — a repayment, whole or partial. */
export interface DebtPayment {
  id: string;
  userId: string;
  debtId: string;
  amount: number;
  date: Date;
  /** The card or cash it moved through — see `Debt.accountId`. Absent on older repayments. */
  accountId?: string;
  /** Why, or how, in the user's words: «τα έδωσε στο χέρι». Read back in the history. */
  notes?: string;
  createdAt: Date;
  /** Written from a bank reading on the reading's own day; its money carries it — see `Transaction.inReading`. */
  inReading?: boolean;
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
  /** See `Debt.accountId`. */
  accountId?: string;
  /** See `Debt.forGoalId`. */
  forGoalId?: string;
}

export interface UpdateDebtDTO {
  person?: string;
  direction?: DebtDirection;
  /** `null` takes it off. */
  label?: string | null;
  amount?: number;
  interestRate?: number;
  termMonths?: number;
  interestFreeMonths?: number;
  rateType?: DebtRateType;
  baseRate?: number;
  margin?: number;
  rateReviewedAt?: Date;
  date?: Date;
  dueDate?: Date | null;
  /** `null` takes it off. */
  notes?: string | null;
  /** See `Debt.forgiven`. `null` takes the forgiveness back. */
  forgiven?: DebtForgiveness | null;
}

export interface CreateDebtPaymentDTO {
  debtId: string;
  amount: number;
  date: Date;
  /** The card or cash it was paid from or into; "" for the main account. Absent: moves nothing. */
  accountId?: string;
  /** See `DebtPayment.notes`. */
  notes?: string;
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

// ============================================================================
// BUSINESS («Δουλειά») TYPES
// ============================================================================

/**
 * One line of a business: an income line («Ταμείο», «Συνταγές ΕΟΠΥΥ») or an
 * expense line («Εμπορεύματα», «Ενοίκιο»). Closings name it by `id`, so a
 * rename reaches every closing with no write to any of them.
 */
export interface BusinessLine {
  id: string;
  name: string;
  /**
   * Taken off the business while closings still name it: no longer offered
   * in a new closing, but kept so those closings still say what it was.
   */
  removed?: boolean;
}

/**
 * A business of the user's («Φαρμακείο», «Λαϊκή»), made by them from zero —
 * no presets. Kept on the user document (workspace key `businesses`), so
 * reading or renaming one costs nothing per closing.
 */
export interface Business {
  id: string;
  name: string;
  incomeLines: BusinessLine[];
  expenseLines: BusinessLine[];
}

/** One income of a day's closing: which income line, how much (> 0, base currency). */
export interface BusinessIncome {
  lineId: string;
  amount: number;
}

/**
 * One expense of a day's closing: an expense line of the business (`lineId`),
 * or a one-off «άλλο έξοδο» with its own `name` and no line.
 */
export interface BusinessExpense {
  lineId?: string;
  name?: string;
  /** Positive, in the base currency. */
  amount: number;
  note?: string;
}

/**
 * One «κλείσιμο ημέρας» (collection `businessEntries`) of one business: what
 * each income line took in and what each expense line paid out. Profit =
 * Σ incomes − Σ expenses. The day's profit (or loss) goes into the owner's own
 * money as ONE linked personal transaction (`linkedTransactionId` ↔
 * `Transaction.businessEntryId`), written, changed and deleted with the
 * closing. Nothing else of the business reaches the personal totals.
 */
export interface BusinessEntry {
  id: string;
  userId: string;
  /** The `Business` (on the user document) this closing belongs to. */
  businessId: string;
  date: Date;
  /** Only lines with an amount (> 0); ≤ 30. */
  incomes: BusinessIncome[];
  /** Only lines with an amount (> 0); ≤ 30. */
  expenses: BusinessExpense[];
  /** The distinct line ids the closing names, incomes and expenses (≤ 60). */
  lineIds?: string[];
  notes?: string;
  /** The personal record of the day's profit or loss; absent when it came to 0. */
  linkedTransactionId?: string;
  /** The card or cash the profit went into (or the loss came out of). */
  accountId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What the closing form writes; the data layer adds `userId`, `lineIds` and the timestamps. */
export type BusinessEntryInput = Pick<BusinessEntry, "businessId" | "date" | "incomes" | "expenses" | "notes" | "accountId">;
