import { firestoreToDate } from "../../shared/utils/dates";
import type { Debt, DebtPayment, DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";

// What is still open, per loan and per person.
//
// Direction is stored, never derived from a sign. "+100" six months from now is
// unreadable — it could as easily mean "they lent me" as "I paid it back" — so
// every figure here is a positive amount travelling in a named direction, and
// the screen says the direction in words.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pairs each debt with its repayments and works out what is left. */
export function computeDebtStatus(debt: Debt, allPayments: DebtPayment[]): DebtWithStatus {
  const payments = allPayments
    .filter((p) => p.debtId === debt.id)
    .sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());

  const paid = round2(payments.reduce((sum, p) => sum + Math.abs(p.amount), 0));
  // Clamped at zero: paying back more than was borrowed settles the loan, it
  // does not turn it into a debt the other way. If that happens it is a new
  // loan in the other direction, which is a thing the user can actually say.
  const remaining = round2(Math.max(debt.amount - paid, 0));

  return { ...debt, payments, paid, remaining, isSettled: remaining <= 0 };
}

/**
 * Everything grouped by the person it is with.
 *
 * People are matched case-insensitively on a trimmed name, so "Νίκος" and
 * "νίκος " are one person rather than two rows that never add up. The name that
 * shows is the one from the most recent loan — the user's latest spelling.
 */
export function debtsByPerson(debts: DebtWithStatus[]): DebtPerson[] {
  const groups = new Map<string, DebtWithStatus[]>();

  for (const debt of debts) {
    const key = debt.person.trim().toLowerCase();
    const rows = groups.get(key);
    if (rows) rows.push(debt);
    else groups.set(key, [debt]);
  }

  return Array.from(groups.values())
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());
      const open = sorted.filter((d) => !d.isSettled);

      const owedByMe = round2(open.filter((d) => d.direction === "owed_by_me").reduce((sum, d) => sum + d.remaining, 0));
      const owedToMe = round2(open.filter((d) => d.direction === "owed_to_me").reduce((sum, d) => sum + d.remaining, 0));

      return { person: sorted[0].person.trim(), owedByMe, owedToMe, net: round2(owedToMe - owedByMe), openCount: open.length, debts: sorted };
    })
    // Anything still open first, largest position first inside that — a settled
    // person is history, and history belongs at the bottom.
    .sort((a, b) => Number(b.openCount > 0) - Number(a.openCount > 0) || Math.abs(b.net) - Math.abs(a.net) || a.person.localeCompare(b.person));
}

export interface DebtTotals {
  owedByMe: number;
  owedToMe: number;
  net: number;
}

/** The two headline figures, which are deliberately not netted against each other. */
export function debtTotals(people: DebtPerson[]): DebtTotals {
  const owedByMe = round2(people.reduce((sum, p) => sum + p.owedByMe, 0));
  const owedToMe = round2(people.reduce((sum, p) => sum + p.owedToMe, 0));
  return { owedByMe, owedToMe, net: round2(owedToMe - owedByMe) };
}

/**
 * The debts the Planner should charge: what you owe and have not yet repaid.
 *
 * Only that direction. Money owed *to* you is not income until it arrives, and
 * a plan that spent it in advance would be the same mistake as counting a sale
 * you have not made.
 */
export function plannableDebts(debts: DebtWithStatus[]): DebtWithStatus[] {
  return debts.filter((d) => d.direction === "owed_by_me" && !d.isSettled);
}
