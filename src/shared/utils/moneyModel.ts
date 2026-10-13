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

/**
 * Money a debt moved through a card: the sum borrowed or lent, and the part of
 * each repayment that came off the debt. It changes what the card holds and
 * nothing else — borrowing 1.000 is not earning it, lending it is not spending
 * it. Kept apart from `isTransfer`, which every report reads as a goal or an
 * investment. A repayment's interest is not one of these: it is a cost.
 */
export const isDebtTransfer = (tx: Pick<Transaction, "debtId" | "debtPart">) => !!tx.debtId && tx.debtPart !== "interest";

/** One half of a move between two of your own accounts — see `Transaction.transferId`. */
export const isAccountTransfer = (tx: Pick<Transaction, "transferId">) => !!tx.transferId;

/**
 * Money that moved between your own accounts: a loan's (see `isDebtTransfer`)
 * or a transfer's. Each changes which account holds the money and nothing
 * else, so every report of what came in or went out leaves them out.
 */
export const isMoneyMove = (tx: Pick<Transaction, "debtId" | "debtPart" | "transferId">) => isDebtTransfer(tx) || isAccountTransfer(tx);

export const isGoalContribution = (tx: Transaction) => !!tx.isGoalTransaction;

export const isInvestmentContribution = (tx: Transaction) => !!tx.isInvestmentTransaction && !tx.isGoalTransaction;

/** Real spending — what actually left your pocket for good. */
export const isSpending = (tx: Transaction) => !isTransfer(tx) && !isMoneyMove(tx) && tx.type === "expense";

/** Plain income plus anything pulled back out of a goal or investment. */
export const isEarning = (tx: Transaction) => (!isTransfer(tx) && !isMoneyMove(tx) && tx.type === "income") || (isTransfer(tx) && tx.contributionType === "withdrawal");
