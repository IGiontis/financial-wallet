import type { CreateDebtDTO, CreateInvestmentContributionDTO, CreateTransactionDTO } from "../../shared/types/IndexTypes";

export interface CoveredFundingVars {
  contribution: CreateInvestmentContributionDTO;
  debt: CreateDebtDTO;
  expense: CreateTransactionDTO;
}

/**
 * What "someone paid part of a goal for me" writes, from either side it is
 * told from — the goal's deposit wizard, or a new debt on «Χρέη» whose money
 * went to a goal: the goal's deposit, the debt to the person (no card moves),
 * and the expense of what they paid. One builder, so the two cannot drift.
 *
 * `debt` adds what the debt form knows besides — a due date, a label.
 */
export function coveredFundingVars(input: {
  goal: { id: string; name: string };
  who: string;
  amount: number;
  date: Date;
  categoryId: string;
  notes: string;
  expenseNotes: string;
  debt?: Partial<CreateDebtDTO>;
}): CoveredFundingVars {
  const { goal, amount, date } = input;
  // Trimmed and with inner runs of spaces made one: a goal named «Σκι διακοπές »
  // wrote its expense with the trailing space, and finding that expense again
  // by the name (see `coveredExpenseOf`) then missed it.
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
  const who = tidy(input.who);
  const name = tidy(goal.name);
  const label = input.debt?.label !== undefined ? tidy(input.debt.label) || name : name;
  return {
    contribution: { goalId: goal.id, amount, contributionType: "deposit", date, notes: input.notes, coveredBy: who },
    // The loan's money is written on the main account, beside the expense: the two
    // cancel there, so the balance does not move for money that never reached it.
    debt: { ...input.debt, label, person: who, direction: "owed_by_me", amount, date, accountId: "", forGoalId: goal.id },
    expense: { amount, type: "expense", categoryId: input.categoryId, date, description: name, notes: input.expenseNotes },
  };
}
