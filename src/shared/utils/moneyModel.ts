import type { Transaction } from "../types/IndexTypes";

// The one description of what counts as money in and money out.
//
//   • A DEPOSIT into a goal or investment is money leaving the spendable pool —
//     a transfer, not spending, so it is never an expense.
//   • A WITHDRAWAL is money coming back, so it counts as income.
//   • Deposit totals are therefore GROSS, never net: netting them *and*
//     counting withdrawals as income would count the same euro twice.
//
// These rules were written out separately in overviewUtils, transactionInsights
// and analyticsUtils. Every screen that reports a total has to agree, so new
// code reads them from here rather than restating them.

export const isTransfer = (tx: Transaction) => !!tx.isInvestmentTransaction || !!tx.isGoalTransaction;

export const isGoalContribution = (tx: Transaction) => !!tx.isGoalTransaction;

export const isInvestmentContribution = (tx: Transaction) => !!tx.isInvestmentTransaction && !tx.isGoalTransaction;

/** Real spending — what actually left your pocket for good. */
export const isSpending = (tx: Transaction) => !isTransfer(tx) && tx.type === "expense";

/** Plain income plus anything pulled back out of a goal or investment. */
export const isEarning = (tx: Transaction) => (!isTransfer(tx) && tx.type === "income") || (isTransfer(tx) && tx.contributionType === "withdrawal");
