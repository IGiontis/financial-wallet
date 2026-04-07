// ============================================================================
// INVESTMENT GOAL TYPES — shared across InvestmentsPage and its modals
// ============================================================================

export type InvestmentGoalType = "targeted" | "open_ended";
export type TargetPeriod = "monthly" | "yearly" | "custom";
export type InvestmentGoalStatus = "on_track" | "behind" | "ahead" | "completed";
export type ContributionType = "deposit" | "withdrawal";

export interface InvestmentGoalWithStats {
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
  // computed
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

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/** Used by both AddDepositModal and WithdrawModal */
export interface CreateContributionDTO {
  amount: number;
  contributionType: ContributionType;
  /** HTML date string — "YYYY-MM-DD" */
  date: string;
  notes?: string;
}

/** Used by AddNewGoalModal */
export interface CreateInvestmentGoalDTO {
  name: string;
  icon?: string;
  color?: string;
  notes?: string;
  goalType: InvestmentGoalType;
  /** Required when goalType === "targeted" */
  targetAmount?: number;
  targetPeriod?: TargetPeriod;
  /** HTML date string — "YYYY-MM-DD" */
  deadline?: string;
  /** HTML date string — "YYYY-MM-DD" */
  endDate?: string;
  isVariableAmount: boolean;
  isActive: boolean;
}
