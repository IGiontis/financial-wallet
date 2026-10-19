import { realDelta } from "../accounts/accountsUtils";
import type { CreateTransactionDTO, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// Where a savings goal's money is now.
//
// Some of it can sit in your own bank, set aside (the usual case); some can
// have been handed to someone to keep — the friend booking the trip
// (`heldBy`). The first never left your cards; the second did, from the card
// it was given from, and comes back to a card only when it is returned.
//
// Read from the goal's records in Transactions (its "mirrors"): every deposit
// and withdrawal is one, with the card and the person on it.

const round2 = (n: number) => Math.round(n * 100) / 100;
const key = (name: string) => name.trim().toLowerCase();

export interface GoalHolder {
  /** As first written. */
  name: string;
  /** What they hold of the goal now. */
  amount: number;
  /** The card it was given from — where it goes back to, and where its spending is written. */
  accountId?: string;
}

export interface GoalHolding {
  holders: GoalHolder[];
  /** Kept in your own banks, set aside. The goal's balance less what others hold. */
  inBanks: number;
  /** Of `inBanks`, what the goal's records account for — see `closingRecords`. */
  inBanksRecorded: number;
}

const mirrorsOf = (goalId: string, transactions: Transaction[]) => transactions.filter((tx) => tx.isGoalTransaction && tx.goalId === goalId);
const signed = (tx: Transaction) => (tx.contributionType === "withdrawal" ? -tx.amount : tx.amount);

export function goalHolding(goal: Pick<InvestmentGoalWithStats, "id" | "totalSaved" | "totalCovered">, transactions: Transaction[]): GoalHolding {
  const byPerson = new Map<string, GoalHolder>();
  let bankRecorded = 0;
  for (const tx of mirrorsOf(goal.id, transactions)) {
    if (!tx.heldBy) {
      bankRecorded += signed(tx);
      continue;
    }
    const k = key(tx.heldBy);
    const holder = byPerson.get(k) ?? { name: tx.heldBy.trim(), amount: 0, accountId: undefined };
    holder.amount = round2(holder.amount + signed(tx));
    // The card it was given from, by the first deposit that names one.
    if (tx.contributionType !== "withdrawal" && holder.accountId === undefined) holder.accountId = tx.accountId;
    byPerson.set(k, holder);
  }
  const holders = [...byPerson.values()].filter((h) => h.amount > 0.005);
  const outside = round2(holders.reduce((sum, h) => sum + h.amount, 0));
  // Neither in your bank nor held by anyone: what someone else paid. Left in
  // "in your bank" it would be spent a second time when the goal is closed — the
  // expense was written the day they paid.
  const inBanks = round2(Math.max(goal.totalSaved - outside - (goal.totalCovered ?? 0), 0));
  return { holders, inBanks, inBanksRecorded: round2(Math.min(Math.max(bankRecorded, 0), inBanks)) };
}

/**
 * What deleting the goal and all its records does to each card: every record
 * taken back, so money given away returns to the card it left. Account id →
 * change ("" for the main account).
 */
export function undoByAccount(goalId: string, transactions: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of mirrorsOf(goalId, transactions)) {
    const delta = realDelta(tx);
    if (Math.abs(delta) < 0.005) continue;
    const k = tx.accountId ?? "";
    out[k] = round2((out[k] ?? 0) - delta);
  }
  return out;
}

/**
 * The goal done and its money spent: the records that close it, written
 * before it is deleted so that its history stays in Transactions.
 *
 *   • For each person holding some of it: a withdrawal they made, and the
 *     expense, both on the card it was given from — they cancel there, as
 *     they must: that card already went down when the money was handed over.
 *   • For what was in your own bank: a withdrawal (it was set aside, so no
 *     card moves) and the expense off the card chosen — that card goes down.
 *
 * Every expense together is the goal's whole balance; every withdrawal
 * together brings it to nothing, so nothing is left counted as set aside.
 */
export function closingRecords(
  goal: Pick<InvestmentGoalWithStats, "id" | "name" | "totalSaved" | "totalCovered">,
  transactions: Transaction[],
  choice: { bankAccountId?: string; categoryId: string; date: Date; note: string },
): CreateTransactionDTO[] {
  const { holders, inBanks, inBanksRecorded } = goalHolding(goal, transactions);
  const goalFields = { type: "investment" as const, categoryId: "", description: goal.name, isInvestmentTransaction: true, isGoalTransaction: true, goalId: goal.id, goalName: goal.name, contributionType: "withdrawal" as const };
  const expense = (amount: number, accountId: string | undefined, description: string): CreateTransactionDTO => ({
    amount: round2(amount),
    type: "expense",
    categoryId: choice.categoryId,
    date: choice.date,
    description,
    notes: choice.note,
    accountId,
  });

  const records: CreateTransactionDTO[] = [];
  for (const h of holders) {
    records.push({ ...goalFields, amount: h.amount, date: choice.date, accountId: h.accountId, heldBy: h.name });
    records.push(expense(h.amount, h.accountId, `${goal.name} · ${h.name}`));
  }
  if (inBanks > 0.005) {
    // Only what the records set aside is taken out of "set aside"; a balance
    // from before goals were recorded was never counted there.
    if (inBanksRecorded > 0.005) records.push({ ...goalFields, amount: inBanksRecorded, date: choice.date, accountId: choice.bankAccountId });
    records.push(expense(inBanks, choice.bankAccountId, goal.name));
  }
  return records;
}
