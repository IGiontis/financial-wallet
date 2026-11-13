import { isSameDay } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { normalizeCategoryName } from "../../shared/utils/categoryNames";
import type { CreateDebtDTO, Debt, InvestmentContribution, InvestmentGoal, Transaction } from "../../shared/types/IndexTypes";

// A debt written because someone paid part of a goal (see `coveredFundingVars`)
// is one of three records that say the same thing: the goal's deposit, the debt
// to the person, and the expense of what they paid. Changed from the Debts page,
// the other two have to change with it — or the goal reads 700/700 over a debt
// of 400, and the expense spends 550 a card never paid.

/**
 * Two descriptions the same to whoever typed them: case, accents and spaces
 * aside — «Σκι διακοπές » with its trailing space is «Σκι διακοπές». Nothing
 * empty matches anything.
 */
export const sameText = (a: string | undefined, b: string | undefined) => {
  const x = normalizeCategoryName(a ?? "");
  return x !== "" && x === normalizeCategoryName(b ?? "");
};

type CoveredDebt = Pick<Debt, "id" | "forGoalId" | "coveredExpenseId" | "amount" | "date" | "label">;

/** Does this expense look like the one written beside this debt — same amount, same day, its name? */
const looksWritten = (t: Transaction, debt: CoveredDebt, goalName: string | undefined) =>
  t.type === "expense" &&
  !t.debtId &&
  !t.goalId &&
  Math.abs(t.amount - debt.amount) < 0.005 &&
  [debt.label, goalName].some((name) => sameText(t.description, name)) &&
  isSameDay(firestoreToDate(t.date), firestoreToDate(debt.date));

/**
 * Which expense each covered debt was written with — only expenses still there.
 *
 * A debt that names its expense (`coveredExpenseId`) and finds it keeps it, and
 * that expense is reserved first, for every debt: no other debt can be matched
 * to it. The rest — debts written before that link existed, or whose named one
 * is gone — are matched by what both were written with (see `looksWritten`),
 * all in one fixed order (the day, then the id), each to an expense nobody has
 * claimed. Worked out over every covered debt at once, never one alone: two
 * friends who paid 100 each on one day would otherwise both find the first
 * expense, and an edit of one and a delete of the other would touch the same
 * record and leave the second one orphaned.
 */
export function coveredExpenses(debts: CoveredDebt[], transactions: Transaction[], goalName: (debt: CoveredDebt) => string | undefined): Map<string, string | undefined> {
  const there = new Set(transactions.map((t) => t.id));
  // A covered debt carries the goal's id; one the caller knows the goal of
  // (a goal's own list of debts) counts too.
  const covered = debts.filter((d) => d.forGoalId || goalName(d) !== undefined);
  const result = new Map<string, string | undefined>();
  const taken = new Set<string>();
  for (const debt of covered) {
    if (debt.coveredExpenseId && there.has(debt.coveredExpenseId)) {
      result.set(debt.id, debt.coveredExpenseId);
      taken.add(debt.coveredExpenseId);
    }
  }
  const unmatched = covered
    .filter((d) => !result.has(d.id))
    .sort((a, b) => firestoreToDate(a.date).getTime() - firestoreToDate(b.date).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const debt of unmatched) {
    const match = transactions.find((t) => !taken.has(t.id) && looksWritten(t, debt, goalName(debt)));
    if (match) taken.add(match.id);
    result.set(debt.id, match?.id);
  }
  return result;
}

/** What a covered debt is tied to, as far as this device can see — only records that are there. */
export interface CoveredLink {
  goalId: string;
  /** The goal's deposit the person paid. Gone with the goal once it is deleted or closed. */
  contribution?: InvestmentContribution;
  /** The expense of what they paid. Gone once the loan was erased with its goal (or, before 2026-11-13, called off with a refund). */
  expense?: Transaction;
  /** Found by its figures rather than named by the debt: worth naming from now on. */
  expenseUnnamed: boolean;
}

/**
 * The records tied to this debt, or undefined for a debt that paid no goal.
 * `debts` is every debt of the user's — see `coveredExpenses` for why.
 */
export function coveredLinkOf(
  debt: CoveredDebt,
  debts: CoveredDebt[],
  contributions: InvestmentContribution[],
  transactions: Transaction[],
  goals: Pick<InvestmentGoal, "id" | "name">[],
): CoveredLink | undefined {
  if (!debt.forGoalId) return undefined;
  const contribution = contributions.find((c) => c.debtId === debt.id && c.contributionType === "deposit");
  const all = debts.some((d) => d.id === debt.id) ? debts : [...debts, debt];
  const expenseId = coveredExpenses(all, transactions, (d) => goals.find((g) => g.id === d.forGoalId)?.name).get(debt.id);
  const expense = expenseId ? transactions.find((t) => t.id === expenseId) : undefined;
  return { goalId: debt.forGoalId, contribution, expense, expenseUnnamed: !!expense && expense.id !== debt.coveredExpenseId };
}

/** A link with nothing left at the other end puts no condition on the debt. */
export const isLive = (link: CoveredLink | undefined): link is CoveredLink => !!link && (!!link.contribution || !!link.expense);

/** The fields to set on the deposit and the expense, and the link to write on the debt. */
export interface CoveredEdit {
  contribution?: { id: string; set: { amount?: number; date?: Date; coveredBy?: string; notes?: string } };
  expense?: { id: string; set: { amount?: number; date?: Date; notes?: string } };
  /** An older debt's expense, found by its figures: named on the debt in the same write. */
  coveredExpenseId?: string;
}

export type CoveredEditPlan = { ok: true; edit: CoveredEdit } | { ok: false; reason: "direction" | "card" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The person's name swapped in a note written with it — «Πλήρωσε: Νίκος». Only
 * where it stands as a whole word, so «Νίκος» is not found inside «Νικόστρατος».
 */
export function renamedIn(text: string | undefined, from: string | (string | undefined)[], to: string): string | undefined {
  // Every old name in one pass, longest first, so a new name that contains an
  // old one («Νίκος» → «Νίκος Παπάς») is never renamed a second time.
  const olds = [...new Set((Array.isArray(from) ? from : [from]).map((n) => n?.trim() ?? "").filter((n) => n && n !== to))].sort((a, b) => b.length - a.length);
  if (text === undefined || olds.length === 0) return text;
  // A function, not the string: a name with «$&» in it would be read as a pattern.
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${olds.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu"), () => to);
}

const differs = (a: number, b: number) => Math.abs(a - b) >= 0.005;

/**
 * What saving the debt form over a covered debt has to write besides the debt.
 *
 * The deposit and the expense are made to say what the debt now says: its
 * amount, its day, its person. Each is compared with its own figure, not the
 * debt's old one — so a deposit left behind by an edit made before this existed
 * is put right by the next save, too. A field already right is not written.
 *
 * Which way the money went and that it reached no card are what make it this
 * kind of debt: changed, the loan's money would no longer sit beside the
 * expense and cancel it, so that is refused rather than written.
 */
export function coveredEdit(debt: Pick<Debt, "person" | "accountId">, next: CreateDebtDTO, link: CoveredLink | undefined): CoveredEditPlan {
  if (!isLive(link)) return { ok: true, edit: {} };
  if (next.direction !== "owed_by_me") return { ok: false, reason: "direction" };
  if ((next.accountId ?? null) !== (debt.accountId ?? null)) return { ok: false, reason: "card" };

  const person = next.person.trim();
  const edit: CoveredEdit = {};

  const c = link.contribution;
  if (c) {
    const set: NonNullable<CoveredEdit["contribution"]>["set"] = {};
    if (differs(c.amount, next.amount)) set.amount = next.amount;
    if (!isSameDay(firestoreToDate(c.date), next.date)) set.date = next.date;
    if (c.coveredBy !== person) {
      set.coveredBy = person;
      const notes = renamedIn(c.notes, [c.coveredBy, debt.person], person);
      if (notes !== c.notes) set.notes = notes;
    }
    if (Object.keys(set).length) edit.contribution = { id: c.id, set };
  }

  const e = link.expense;
  if (e) {
    const set: NonNullable<CoveredEdit["expense"]>["set"] = {};
    if (differs(e.amount, next.amount)) set.amount = next.amount;
    if (!isSameDay(firestoreToDate(e.date), next.date)) set.date = next.date;
    // From the debt's own person before this save first: the deposit's name may
    // already be the new one, written by a save the expense missed.
    const notes = renamedIn(e.notes, [debt.person, c?.coveredBy], person);
    if (notes !== e.notes) set.notes = notes;
    if (Object.keys(set).length) edit.expense = { id: e.id, set };
    if (link.expenseUnnamed) edit.coveredExpenseId = e.id;
  }

  return { ok: true, edit };
}

/** True when saving writes nothing besides the debt. */
export const isEmptyEdit = (edit: CoveredEdit) => !edit.contribution && !edit.expense && !edit.coveredExpenseId;
