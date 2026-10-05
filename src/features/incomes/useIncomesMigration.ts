import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../shared/hooks/useAuth";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useCategories, useTransactions } from "../transactions/hooks/useTransactions";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import { PLANNER_KEYS } from "../plannerPage/plannerInputs";
import { detectSalary } from "./detectSalary";
import { PLANNER_SALARY_KEY, migratePlannerIncomes, migrationStep, type MigrationOptions } from "./incomeMigration";
import { INCOMES_KEY, type Income } from "./incomesUtils";

/**
 * Accounts this session has already moved. Outside React: three screens call
 * the hook, sometimes in one render, and the move must happen once — the
 * guard is set before the first write, so a second caller in the same commit
 * finds it taken.
 */
const moved = new Set<string>();

/** For tests, which run many accounts' worth of moves in one module. */
export function resetIncomesMigration() {
  moved.clear();
}

/** This device holds an `incomes` of its own not yet on the account — written offline, say. It goes up by itself. */
function cachedOnDevice(): boolean {
  try {
    return localStorage.getItem(INCOMES_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Moves the old Planner's salary and income lines to «Έσοδα», once, the first
 * time a screen that reads the incomes finds there is something to move — see
 * `migrationStep` for when, and `migratePlannerIncomes` for what.
 *
 * Called from `useIncomeList`, so the Incomes page, the Planner, the Overview,
 * the Bills page and the Allocation page all pass through it: whichever the
 * user opens first after the update, the salary is there.
 *
 * Writes `incomes`, and `planner-skip` and `planner-occurrences` re-keyed to
 * the new salary — those two only when something in them changes. The old
 * `planner-salary` and income lines are left as they were; nothing reads them
 * after this. The salary gets a fixed id, so two devices moving the same plan
 * write the same list.
 *
 * `pending` is true from the moment the account's copy shows a move is due
 * until it is written — a screen shows itself as loading meanwhile, rather
 * than a plan without its salary for one frame.
 */
export function useIncomesMigration(): { pending: boolean } {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const { data: workspace, isSuccess: workspaceLoaded } = useWorkspace();
  const [, setIncomes] = useWorkspaceSetting<Income[]>(INCOMES_KEY, []);
  const [plannerSalary] = useWorkspaceSetting<unknown>(PLANNER_SALARY_KEY, undefined);
  const [plannerLines] = useWorkspaceSetting<unknown>(PLANNER_KEYS.lines, []);
  const [skip, setSkip] = useWorkspaceSetting<string[]>(PLANNER_KEYS.skip, []);
  const [occurrences, setOccurrences] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  // Fetched, or failed to be: a failed read must not hold the screen on
  // "loading" for ever — the move then runs without the detected salary.
  const { data: transactions, isFetched: transactionsLoaded } = useTransactions();
  const { data: categories } = useCategories();
  // Read once, when the screen opens. A list written after that — by this
  // move, or by the user — is in the workspace below as well.
  const [onDevice] = useState(cachedOnDevice);

  const incomesExist = !!workspace && (INCOMES_KEY in workspace || onDevice);
  const step = migrationStep({ workspaceLoaded, incomesExist, plannerSalary, plannerLines, transactionsLoaded });

  useEffect(() => {
    if (step !== "run" || !userId || moved.has(userId)) return;
    moved.add(userId);

    const now = new Date();
    const options: MigrationOptions = { now, detected: detectSalary(transactions ?? [], now), salaryName: t("incomes.kind.salary"), categories };
    const result = migratePlannerIncomes(plannerSalary, plannerLines, skip, occurrences, options);

    setIncomes(result.incomes);
    // Written only when the move changes them, and from whatever is stored at
    // the moment of writing, so nothing said meanwhile is lost.
    if (JSON.stringify(result.skip) !== JSON.stringify(skip)) setSkip((previous) => migratePlannerIncomes(plannerSalary, plannerLines, previous, {}, options).skip);
    if (JSON.stringify(result.occurrences) !== JSON.stringify(occurrences)) setOccurrences((previous) => migratePlannerIncomes(plannerSalary, plannerLines, [], previous, options).occurrences);
  }, [step, userId, transactions, categories, plannerSalary, plannerLines, skip, occurrences, setIncomes, setSkip, setOccurrences, t]);

  // Not once it has run: should the write somehow not show, the screen must
  // not wait on it for ever.
  return { pending: step !== "idle" && !moved.has(userId) };
}
