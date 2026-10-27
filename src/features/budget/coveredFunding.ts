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
  const { goal, who, amount, date } = input;
  return {
    contribution: { goalId: goal.id, amount, contributionType: "deposit", date, notes: input.notes, coveredBy: who },
    // The loan's money is written on the main account, beside the expense: the two
    // cancel there, so the balance does not move for money that never reached it.
    debt: { label: goal.name, ...input.debt, person: who, direction: "owed_by_me", amount, date, accountId: "", forGoalId: goal.id },
    expense: { amount, type: "expense", categoryId: input.categoryId, date, description: goal.name, notes: input.expenseNotes },
  };
}
