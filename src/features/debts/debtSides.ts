import { debtProgress, debtTotals, isLoan, type DebtTotals } from "./debtsUtils";
import { textKey } from "../../shared/utils/cleanText";
import { firestoreToDate } from "../../shared/utils/dates";
import type { DebtDirection, DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";

/**
 * The Debts overview «Ζυγαριά» (owner, 2026-11-16): the two sides of the
 * scale, one row per person on each side they are open on.
 *
 * Nothing is counted anew here. A row's figure is the person's own open total
 * in that direction (`debtsByPerson`), and the side totals are `debtTotals` —
 * the very figures the old «Χρωστάς / Σου χρωστούν» tiles showed — so the page
 * and the Overview can never disagree. Settled, forgiven and cancelled debts
 * are on no side: they are the archive.
 */
/**
 * A person's key in the address — never their name (owner, 2026-11-17: page
 * views go to analytics, and addresses sit in history and in shared links;
 * `lib/analytics.ts` promises the paths hold no one's data). A short stable
 * hash of the name's compare key (`textKey`: case, accents, spaces folded),
 * made on the device and found again only by matching this user's own debts:
 * the same name always gives the same key, and the key gives nothing back.
 * cyrb53 (53 bits) in base 36, the first 10 characters.
 */
export function personKey(person: string): string {
  const text = textKey(person);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36).padStart(10, "0").slice(0, 10);
}

/** A person's own page: everything with them (`/debts/person/:key`, `personKey`). */
export const personPath = (person: string) => `/debts/person/${personKey(person)}`;
/** A bank loan's own page (`/debts/loan/:id`). */
export const loanPath = (debtId: string) => `/debts/loan/${encodeURIComponent(debtId)}`;
/** Where a debt is shown: a bank loan on its own page, anything else on its person's. */
export const debtPath = (debt: Pick<DebtWithStatus, "id" | "person" | "termMonths">) => (isLoan(debt) ? loanPath(debt.id) : personPath(debt.person));

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SideRow {
  /** Where the row leads: the person's page, or the bank loan's. */
  to: string;
  /** A bank loan, on a row of its own. */
  loan: boolean;
  person: string;
  direction: DebtDirection;
  /** What is still open on the row: the person's debts in this direction (bank loans aside), or the loan. */
  amount: number;
  /** Open debts with them in this direction. */
  count: number;
  /** The one open debt's own name, when there is only one and it has one («Στεγαστικό»). */
  label?: string;
  /** How much of those debts is gone, 0–100, as the old list's bar: principal repaid over what started them. */
  cleared: number;
  /** The open debt to put in front when the row is opened: the newest one on this side. */
  debtId: string;
  /** Every debt id on the row — for the saved flash and the pending mark. */
  ids: string[];
}

export interface DebtSides {
  owe: SideRow[];
  owed: SideRow[];
  totals: DebtTotals;
}

function rowOf(person: DebtPerson, direction: DebtDirection, open: DebtWithStatus[], loan: boolean): SideRow {
  const progress = open.map((d) => debtProgress(d));
  const started = progress.reduce((sum, p) => sum + p.started, 0);
  const principal = progress.reduce((sum, p) => sum + p.principal, 0);
  const cleared = started > 0 ? Math.min(Math.max(Math.round((principal / started) * 100), 0), 100) : 0;
  return {
    to: loan ? loanPath(open[0].id) : personPath(person.person),
    loan,
    person: person.person,
    direction,
    amount: round2(open.reduce((sum, d) => sum + d.remaining, 0)),
    count: open.length,
    label: open.length === 1 ? open[0].label?.trim() || undefined : undefined,
    cleared,
    debtId: open[0].id,
    ids: open.map((d) => d.id),
  };
}

/** One person's rows on one side: their debts together, and each bank loan on its own. */
function sideRows(person: DebtPerson, direction: DebtDirection): SideRow[] {
  // `person.debts` is newest first, so the first open one is the newest.
  const open = person.debts.filter((d) => !d.isSettled && d.direction === direction && d.remaining > 0);
  const plain = open.filter((d) => !isLoan(d));
  return [...(plain.length > 0 ? [rowOf(person, direction, plain, false)] : []), ...open.filter((d) => isLoan(d)).map((d) => rowOf(person, direction, [d], true))];
}

/** Each side, the largest first; the totals are the page's two headline figures. */
export function debtSides(people: DebtPerson[]): DebtSides {
  const side = (direction: DebtDirection) => people.flatMap((p) => sideRows(p, direction)).sort((a, b) => b.amount - a.amount || a.person.localeCompare(b.person));
  return { owe: side("owed_by_me"), owed: side("owed_to_me"), totals: debtTotals(people) };
}

/**
 * How the balance bar divides: the red share is what you owe out of everything
 * open both ways. Nothing open either way draws no share at all (an empty track).
 */
export function balanceShares(totals: Pick<DebtTotals, "owedByMe" | "owedToMe">): { owe: number; owed: number } {
  const whole = totals.owedByMe + totals.owedToMe;
  if (whole <= 0) return { owe: 0, owed: 0 };
  const owe = (totals.owedByMe / whole) * 100;
  return { owe, owed: 100 - owe };
}

/** The day a closed debt closed: forgiven on its day, paid off on its last payment, else the day it began. */
export function closedOn(debt: DebtWithStatus): Date {
  if (debt.forgiven) return firestoreToDate(debt.forgiven.date);
  if (debt.payments[0]) return firestoreToDate(debt.payments[0].date);
  return firestoreToDate(debt.date);
}

/**
 * «Αρχείο»: every settled, forgiven or cancelled debt, the latest closed first.
 * Nothing is deleted and nothing read — it is the list the device already holds.
 */
export function archivedDebts(debts: DebtWithStatus[]): DebtWithStatus[] {
  return debts.filter((d) => d.isSettled).sort((a, b) => closedOn(b).getTime() - closedOn(a).getTime() || a.person.localeCompare(b.person));
}

/** What deleting these closed debts from «Αρχείο» takes, and what it leaves — said before it is done. */
export interface ClosedDeletePlan {
  /** The debts that go. */
  debts: number;
  /** Their repayment records, which go with them. */
  repayments: number;
  /** Their money in Συναλλαγές, which stays (`debtKept`). */
  keptMoney: number;
  /** Of the debts, those a friend took on to pay part of a goal: its deposit and its expense stay too. */
  covered: number;
}

/**
 * From what the device holds — no read. The money counted is every record a
 * debt wrote (`debtId`) that is not already kept; the server's own count is
 * what `deleteClosedDebts` acts on.
 */
export function closedDeletePlan(debts: DebtWithStatus[], transactions: { debtId?: string; debtKept?: boolean }[]): ClosedDeletePlan {
  const ids = new Set(debts.map((d) => d.id));
  return {
    debts: debts.length,
    repayments: debts.reduce((sum, d) => sum + d.payments.length, 0),
    keptMoney: transactions.filter((tx) => tx.debtId && ids.has(tx.debtId) && !tx.debtKept).length,
    covered: debts.filter((d) => d.forGoalId || d.coveredExpenseId).length,
  };
}
