import { firestoreToDate } from "../../shared/utils/dates";
import type { DebtCashPart, DebtWithStatus } from "../../shared/types/IndexTypes";
import { isLoan, loanSplits } from "./debtsUtils";
import { DEBT_CATEGORY_ID, DEBT_INTEREST_CATEGORY_ID } from "../../shared/utils/categories";

// The money a debt moves through a card, as the transactions it writes.
//
// A debt that names where its money went (`accountId`, "" for the main
// account) writes one transaction for the sum borrowed or lent, and each
// repayment that names one writes its own: the part that came off the debt,
// and on a loan with interest, the interest as a second record. The first two
// are transfers — a card goes up or down, nothing is earned or spent (see
// `isDebtTransfer`); the interest is a real cost, or on money lent, income.
//
// Derived, never edited by hand: every write to a debt or a repayment ends
// with `syncDebtCash`, which makes the transactions match this list. Their ids
// are fixed by what they stand for, so keeping them in step needs no reads —
// the same ids are simply written again, and the ones no longer wanted deleted.

/** Every transaction a debt's money is written as, ready to save. */
export interface DebtCashRecord {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: Date;
  /** Absent for the main account, as on any transaction. */
  accountId?: string;
  debtId: string;
  debtPaymentId?: string;
  debtPart: DebtCashPart;
  categoryId: string;
  description: string;
  createdAt: Date;
}

export { DEBT_CATEGORY_ID, DEBT_INTEREST_CATEGORY_ID };

export const debtCashIds = {
  loan: (debtId: string) => `debt_${debtId}`,
  principal: (paymentId: string) => `debtpay_${paymentId}`,
  interest: (paymentId: string) => `debtint_${paymentId}`,
};

/** Every id a debt and these repayments could have written — the ones to clear on delete. */
export function allDebtCashIds(debtId: string, paymentIds: string[]): string[] {
  return [debtCashIds.loan(debtId), ...paymentIds.flatMap((id) => [debtCashIds.principal(id), debtCashIds.interest(id)])];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const asDate = (value: unknown, fallback: Date) => (value ? firestoreToDate(value as Date) : fallback);

/**
 * What a debt's money should be as transactions, and which of its possible
 * ids should not exist — so a repayment whose interest came to nothing, or a
 * debt whose card was taken off, leaves nothing behind.
 */
export function debtCashRecords(debt: DebtWithStatus, now: Date = new Date()): { records: DebtCashRecord[]; remove: string[] } {
  // I borrowed: the money came into the card, repayments leave it. I lent: the other way.
  const borrowed = debt.direction === "owed_by_me";
  const out: "income" | "expense" = borrowed ? "expense" : "income";
  const description = debt.label?.trim() || debt.person;
  const records: DebtCashRecord[] = [];
  const account = (id: string | undefined) => (id ? id : undefined);

  if (debt.accountId !== undefined && debt.amount > 0) {
    records.push({
      id: debtCashIds.loan(debt.id),
      type: borrowed ? "income" : "expense",
      amount: round2(debt.amount),
      date: firestoreToDate(debt.date),
      accountId: account(debt.accountId),
      debtId: debt.id,
      debtPart: "loan",
      categoryId: DEBT_CATEGORY_ID,
      description,
      createdAt: asDate(debt.createdAt, now),
    });
  }

  // On a loan, each repayment divides into interest and what came off the
  // debt — the same split the loan sheet shows. Between people, all of it is
  // the debt.
  const splits = isLoan(debt) ? loanSplits(debt, now) : undefined;
  for (const payment of debt.payments) {
    if (payment.accountId === undefined) continue;
    const amount = round2(Math.abs(payment.amount));
    const interest = round2(splits?.get(payment.id)?.interest ?? 0);
    const principal = round2(amount - interest);
    const base = {
      date: firestoreToDate(payment.date),
      accountId: account(payment.accountId),
      debtId: debt.id,
      debtPaymentId: payment.id,
      description,
      createdAt: asDate(payment.createdAt, now),
    };
    if (principal > 0) records.push({ ...base, id: debtCashIds.principal(payment.id), type: out, amount: principal, debtPart: "principal", categoryId: DEBT_CATEGORY_ID });
    if (interest > 0) records.push({ ...base, id: debtCashIds.interest(payment.id), type: out, amount: interest, debtPart: "interest", categoryId: DEBT_INTEREST_CATEGORY_ID });
  }

  const wanted = new Set(records.map((r) => r.id));
  const remove = allDebtCashIds(
    debt.id,
    debt.payments.map((p) => p.id),
  ).filter((id) => !wanted.has(id));
  return { records, remove };
}
