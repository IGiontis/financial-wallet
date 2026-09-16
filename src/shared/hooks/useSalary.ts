import { useMemo } from "react";
import { useTransactions } from "../../features/transactions/hooks/useTransactions";
import { detectSalary, type SalaryPattern } from "../../features/plannerPage/plannerUtils";
import { useWorkspaceSetting } from "./useWorkspaceSetting";

/**
 * What arrives every month, and when — as the planner decides it.
 *
 * Lifted out of the planner when a second screen needed the same answer. Two
 * copies of this would be two screens quietly disagreeing about pay day, which
 * is exactly the sort of difference nobody notices until they are planning
 * against the wrong date.
 *
 * Detection only ever fills the field in; the figure that counts is whatever is
 * left in the box, so a typed figure always wins over a guessed one.
 */
export interface SalaryInput {
  amount: string;
  day: string;
}

export function useSalary(now: Date): {
  /** The figure to plan with, or undefined when nothing is known. */
  salary: SalaryPattern | undefined;
  /** What the user typed, for the fields that edit it. */
  input: SalaryInput;
  setInput: (value: SalaryInput | ((previous: SalaryInput) => SalaryInput)) => void;
  /** What the transactions suggest, shown as a placeholder and as a way back. */
  detected: SalaryPattern | undefined;
  /** True once anything has been typed — the guess is no longer in charge. */
  isManual: boolean;
} {
  const { data: transactions = [] } = useTransactions();
  const [stored, setInput] = useWorkspaceSetting<SalaryInput>("planner-salary", { amount: "", day: "" });

  // Coerced to strings: an older save may hold numbers, and the fields that edit
  // this are text inputs either way.
  const input = useMemo(() => ({ amount: String(stored?.amount ?? ""), day: String(stored?.day ?? "") }), [stored]);

  const detected = useMemo(() => detectSalary(transactions, now), [transactions, now]);

  const salary = useMemo(() => {
    const typedAmount = parseFloat(input.amount);
    const typedDay = parseInt(input.day, 10);

    const amount = Number.isFinite(typedAmount) && typedAmount > 0 ? typedAmount : detected?.amount;
    const dayOfMonth = Number.isFinite(typedDay) && typedDay >= 1 && typedDay <= 31 ? typedDay : detected?.dayOfMonth;

    return amount && dayOfMonth ? { amount, dayOfMonth, occurrences: detected?.occurrences ?? 0 } : undefined;
  }, [input, detected]);

  return { salary, input, setInput, detected, isManual: input.amount.trim() !== "" || input.day.trim() !== "" };
}
