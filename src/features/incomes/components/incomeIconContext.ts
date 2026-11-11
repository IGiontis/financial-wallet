import { createContext, useCallback, useContext } from "react";
import type { Category } from "../../../shared/types/IndexTypes";
import { incomeIcon, type Income } from "../incomesUtils";

/**
 * The categories an income's icon is read from (see `incomeIcon`), handed down
 * once by the page instead of through every card and list. With none given —
 * a view rendered on its own — an income shows its stored kind's icon.
 */
export const IncomeCategoriesContext = createContext<readonly Category[]>([]);

/** `(income) => icon`: the category's icon, or the old kind's for a record without one. */
export function useIncomeIcon() {
  const categories = useContext(IncomeCategoriesContext);
  return useCallback((income: Pick<Income, "kind" | "categoryId">) => incomeIcon(income, categories), [categories]);
}
