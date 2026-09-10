import { addMonths, differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";
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
export function computeDebtStatus(debt: Debt, allPayments: DebtPayment[], now: Date = new Date()): DebtWithStatus {
  const payments = allPayments
    .filter((p) => p.debtId === debt.id)
    .sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());

  const paid = round2(payments.reduce((sum, p) => sum + Math.abs(p.amount), 0));
  // Clamped at zero: paying back more than was borrowed settles the loan, it
  // does not turn it into a debt the other way. If that happens it is a new
  // loan in the other direction, which is a thing the user can actually say.
  const handedBack = round2(Math.max(debt.amount - paid, 0));

  // A loan owes more than it was lent. "Borrowed less repaid" is exactly right
  // between two people and wrong the moment interest is charged: it would have
  // this figure fall faster than the debt actually does, and stop at zero
  // several payments before the lender does.
  const state = isLoan(debt) ? loanState({ ...debt, payments, paid, remaining: handedBack, isSettled: false }, now) : undefined;
  const remaining = state ? state.balance : handedBack;

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

// ─── Loans ───────────────────────────────────────────────────────────────────
//
// A loan is a debt whose balance grows. Everything above treats what is owed as
// "handed over, less handed back", which is exactly right between two people
// and quietly wrong once a bank is involved: on €10,000 at 7% over five years
// that arithmetic hides €1,881 of interest, reports the monthly cost as €167
// when the bank takes €198, and after a year says the balance is €645 lower
// than it is. Early payments are mostly interest; the principal barely moves.
//
// A debt with no rate behaves exactly as it always did — every function here
// returns undefined for one, and nothing downstream changes.

/**
 * Is this repaid on a schedule, rather than whenever there is money?
 *
 * The term is what decides it, not the rate. Twelve άτοκες δόσεις carry no
 * interest at all and are still a loan in every way that matters here: a fixed
 * payment, a known end, and a plan that has to make room for it every month.
 */
export const isLoan = (debt: Pick<Debt, "termMonths">): boolean => (debt.termMonths ?? 0) > 0;

/** Does the rate move under the borrower, or is it the same for the whole term? */
export const isFloating = (debt: Pick<Debt, "rateType">): boolean => debt.rateType === "floating";

/**
 * The all-in annual rate in force today — index plus margin on a floating loan,
 * the agreed rate on a fixed one.
 *
 * Everything below is computed from this one number, and on a floating loan it
 * is a photograph rather than a fact: it is what the bank charges this month.
 * Reading the two parts here rather than the stored `interestRate` means the
 * screen can never show a payment worked out from a stale index while the parts
 * beside it say something else.
 */
export function currentRate(debt: Pick<Debt, "rateType" | "interestRate" | "baseRate" | "margin">): number {
  if (!isFloating(debt)) return debt.interestRate ?? 0;
  return round2(Math.max((debt.baseRate ?? 0) + (debt.margin ?? 0), 0));
}

/**
 * The level payment that clears a loan over its term — the annuity formula.
 *
 * At 0% it is simply the principal split evenly, which is the limit of the
 * formula and would otherwise divide by zero.
 */
function exactInstalment(principal: number, annualRatePct: number, termMonths: number, interestFreeMonths = 0): number {
  if (!(principal > 0) || !(termMonths > 0)) return 0;

  const monthly = annualRatePct / 100 / 12;
  const free = Math.max(Math.min(interestFreeMonths, termMonths), 0);
  // Nothing is ever charged: the payment is simply the debt split evenly.
  if (monthly <= 0 || free >= termMonths) return principal / termMonths;

  // The level payment that covers an interest-free opening and then amortises
  // whatever is left over the months that do charge. After `free` payments the
  // balance is `principal − free·P`, and that has to be the amount the annuity
  // clears over the remaining term — so P·(1 + free·k) = principal·k, where k is
  // the annuity factor for the paying months.
  const paying = termMonths - free;
  const growth = Math.pow(1 + monthly, paying);
  const factor = (monthly * growth) / (growth - 1);
  return (principal * factor) / (1 + free * factor);
}

export function monthlyInstalment(principal: number, annualRatePct: number, termMonths: number, interestFreeMonths = 0): number {
  return round2(exactInstalment(principal, annualRatePct, termMonths, interestFreeMonths));
}

export interface LoanState {
  /** What is actually still owed, principal only. */
  balance: number;
  /** Interest charged so far, over the life of the loan to this point. */
  interestPaid: number;
  /** Of everything handed over, the part that reduced the debt. */
  principalPaid: number;
  /** The contractual payment. */
  instalment: number;
}

/**
 * Where a loan stands, from its actual repayments rather than its schedule.
 *
 * Interest accrues on the balance day by day — actual days over 365, the
 * convention consumer loans are usually quoted on — and each payment is applied
 * to the interest accrued since the last one, then to the principal. Reading
 * the real payments rather than the schedule means a missed month makes the
 * balance go up, and an overpayment shortens the loan, both of which are true
 * and neither of which a schedule would show.
 */
export function loanState(debt: DebtWithStatus, asOf: Date = new Date()): LoanState | undefined {
  if (!isLoan(debt)) return undefined;

  const instalment = monthlyInstalment(debt.amount, currentRate(debt), debt.termMonths ?? 0, debt.interestFreeMonths ?? 0);
  const dailyRate = currentRate(debt) / 100 / 365;
  // Nothing accrues until the free months are up.
  const chargesFrom = addMonths(firestoreToDate(debt.date), Math.max(debt.interestFreeMonths ?? 0, 0));

  // Oldest first: interest is charged on what was owed at the time.
  const payments = [...debt.payments].sort((a, b) => firestoreToDate(a.date).getTime() - firestoreToDate(b.date).getTime());

  let balance = debt.amount;
  let interestPaid = 0;
  let principalPaid = 0;
  let cursor = firestoreToDate(debt.date);

  const accrueTo = (date: Date) => {
    // Only the stretch on the far side of the free period is charged for.
    const from = cursor > chargesFrom ? cursor : chargesFrom;
    const days = Math.max(differenceInCalendarDays(date, from), 0);
    if (days > 0 && balance > 0) {
      const interest = balance * dailyRate * days;
      balance += interest;
      interestPaid += interest;
    }
    cursor = date;
  };

  for (const payment of payments) {
    accrueTo(firestoreToDate(payment.date));
    const amount = Math.abs(payment.amount);
    // Whatever is left of a payment after the interest it met reduces the debt.
    principalPaid += Math.min(amount, Math.max(balance, 0));
    balance = Math.max(balance - amount, 0);
  }

  accrueTo(asOf);

  return {
    balance: round2(balance),
    interestPaid: round2(interestPaid),
    principalPaid: round2(principalPaid),
    instalment,
  };
}

export interface ScheduleRow {
  /** 1-based payment number. */
  number: number;
  date: Date;
  payment: number;
  interest: number;
  principal: number;
  /** What is left after this payment. */
  balance: number;
}

export interface Payoff {
  /** Payments still to make. */
  months: number;
  /** The month the last one falls in. */
  finishDate: Date;
  /** Interest still to pay from here on. */
  interestToCome: number;
  schedule: ScheduleRow[];
}

/**
 * What is left to pay, month by month, at a given monthly payment.
 *
 * `extra` is the overpayment being considered — the question a borrower
 * actually asks. Every euro above the interest goes straight at the principal,
 * so a small regular addition takes months off the end and compounds into a
 * saving far larger than itself.
 */
export function loanPayoff(debt: DebtWithStatus, extra = 0, asOf: Date = new Date()): Payoff | undefined {
  const state = loanState(debt, asOf);
  if (!state || state.balance <= 0) return undefined;

  const monthly = currentRate(debt) / 100 / 12;
  // The exact annuity payment, not the rounded one on screen. Two tenths of a
  // cent a month short is enough to leave a balance after the final payment and
  // grow the schedule a sixty-first row for twelve cents.
  const payment = exactInstalment(debt.amount, currentRate(debt), debt.termMonths ?? 0, debt.interestFreeMonths ?? 0) + Math.max(extra, 0);
  // How many of the free months are still ahead. Past them the rate applies to
  // whatever is left, which is the whole point of the offer running out.
  const chargesFrom = addMonths(firestoreToDate(debt.date), Math.max(debt.interestFreeMonths ?? 0, 0));
  const freeLeft = Math.max(differenceInCalendarMonths(chargesFrom, asOf), 0);

  // The walk keeps full precision and only the reported figures are rounded.
  // Rounding the balance every month left a few cents outstanding after the
  // final payment, and the schedule grew a sixty-first row for them — which is
  // not what a bank does, and not what the borrower would ever see.
  let balance = state.balance;
  let interestToCome = 0;
  const schedule: ScheduleRow[] = [];

  // A payment that does not even meet the interest never clears the debt, so
  // the walk is bounded rather than trusting the arithmetic to terminate.
  for (let number = 1; balance > 0.005 && number <= 600; number++) {
    const interest = number <= freeLeft ? 0 : balance * monthly;
    const due = Math.min(payment, balance + interest);
    const principal = due - interest;

    // Under half a cent off the debt a month is not repayment: the payment is
    // being swallowed by the interest and the loan never ends.
    if (principal <= 0.005) return undefined;

    balance -= principal;
    interestToCome += interest;
    // The three figures on a row are rounded so that they tie: the principal is
    // what is left of the rounded payment after the rounded interest, rather
    // than a third independent rounding. Otherwise a reader adding up the
    // columns of their own schedule finds it eleven cents out.
    const shownPayment = round2(due);
    const shownInterest = round2(interest);
    schedule.push({
      number,
      date: addMonths(asOf, number),
      payment: shownPayment,
      interest: shownInterest,
      principal: round2(shownPayment - shownInterest),
      balance: round2(Math.max(balance, 0)),
    });
  }

  // The last payment carries the rounding, which is what a lender does too:
  // sixty rows each rounded to the cent leave the principal column eleven cents
  // short of the debt, and a schedule whose column does not add up to the loan
  // is the first thing a careful reader checks.
  const last = schedule[schedule.length - 1];
  if (last) {
    const drift = round2(state.balance - schedule.reduce((sum, row) => sum + row.principal, 0));
    if (drift !== 0) {
      last.principal = round2(last.principal + drift);
      last.payment = round2(last.interest + last.principal);
    }
  }

  return {
    months: schedule.length,
    finishDate: schedule.length ? schedule[schedule.length - 1].date : asOf,
    interestToCome: round2(interestToCome),
    schedule,
  };
}

export interface PayoffSaving {
  monthsSaved: number;
  interestSaved: number;
  finishDate: Date;
}

/** What paying `extra` a month buys: time off the end, and interest never charged. */
export function payoffSaving(debt: DebtWithStatus, extra: number, asOf: Date = new Date()): PayoffSaving | undefined {
  const base = loanPayoff(debt, 0, asOf);
  const faster = loanPayoff(debt, extra, asOf);
  if (!base || !faster) return undefined;

  return {
    monthsSaved: base.months - faster.months,
    interestSaved: round2(base.interestToCome - faster.interestToCome),
    finishDate: faster.finishDate,
  };
}

// ─── When the rate moves ─────────────────────────────────────────────────────
//
// Most mortgages here are not fixed at all: the rate is an index — Euribor, or
// the ECB's own — plus a margin the bank sets once, and it is re-read every one,
// three or six months. Everything above is worked out from the rate in force
// today, which makes the instalment, the end date and the interest still to come
// true of today and of no other day.
//
// A floating loan is repriced rather than restarted: the bank keeps the end date
// and changes the payment, recalculating it on what is still owed over the
// months that are left. So the question worth answering is not what the loan
// would have cost at some other rate — it was never at that rate — but what the
// payment becomes if the index moves from here. That is the stress test the
// ESIS disclosure puts in front of every borrower once, at signing, and that
// nobody ever recomputes afterwards.

export interface RateOutlook {
  /** The all-in annual rate being tested. */
  rate: number;
  /** The payment that would clear what is left over the months that remain. */
  instalment: number;
  /** How much more, each month, than the payment at today's rate. */
  instalmentDelta: number;
  /** Interest from here to the end at that rate. */
  interestToCome: number;
  /** How much more of it than at today's rate. */
  interestDelta: number;
  monthsLeft: number;
}

interface Repriced {
  months: number;
  balance: number;
  instalment: number;
}

/** The payment at `ratePct` on what is still owed, over the months that are left. */
function repriceRemaining(debt: DebtWithStatus, ratePct: number, asOf: Date): Repriced | undefined {
  const state = loanState(debt, asOf);
  const remaining = loanPayoff(debt, 0, asOf);
  if (!state || !remaining || remaining.months <= 0 || state.balance <= 0) return undefined;

  // Free months already used up are gone; only the ones still ahead lower the
  // repriced payment, and never more of them than there are payments left.
  const chargesFrom = addMonths(firestoreToDate(debt.date), Math.max(debt.interestFreeMonths ?? 0, 0));
  const freeLeft = Math.min(Math.max(differenceInCalendarMonths(chargesFrom, asOf), 0), remaining.months);

  return { months: remaining.months, balance: state.balance, instalment: exactInstalment(state.balance, ratePct, remaining.months, freeLeft) };
}

/**
 * What a move of `deltaPoints` in the rate would do to this loan, from today.
 *
 * Points, not percent: a loan at 3.5% with the index up one point is at 4.5%,
 * not 3.535%. A negative delta is a cut, and the rate is floored at zero because
 * a bank does not pay you to borrow.
 */
export function rateOutlook(debt: DebtWithStatus, deltaPoints: number, asOf: Date = new Date()): RateOutlook | undefined {
  const today = currentRate(debt);
  const shifted = Math.max(today + deltaPoints, 0);

  const now = repriceRemaining(debt, today, asOf);
  const then = repriceRemaining(debt, shifted, asOf);
  if (!now || !then) return undefined;

  // Every difference here is the difference between two figures the reader can
  // see, rather than a more exact one worked out behind them. The payment goes
  // up by what the two payments differ by; the interest goes up by what the two
  // totals differ by. Taking the delta from the unrounded payment instead is a
  // cent nearer the truth and a cent away from the column beside it, and a
  // reader who subtracts what is on screen must not get a different answer.
  const interestNow = round2(now.instalment * now.months - now.balance);
  const interestThen = round2(then.instalment * then.months - then.balance);

  return {
    rate: round2(shifted),
    instalment: round2(then.instalment),
    instalmentDelta: round2(round2(then.instalment) - round2(now.instalment)),
    interestToCome: interestThen,
    interestDelta: round2(interestThen - interestNow),
    monthsLeft: then.months,
  };
}
