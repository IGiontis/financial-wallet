import type { Category } from "../../shared/types/IndexTypes";
import { parseISOMonth, toISOMonth } from "../../shared/utils/dates";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import type { BudgetLine, SalaryPattern } from "../plannerPage/plannerUtils";
import { cleanIncome, incomeOccurrenceKey, suggestIncomeCategory, type Income } from "./incomesUtils";

// Moving the Planner's incomes into the Incomes page — once, in one write.
//
// Phase 1 only writes this; phase 2 calls it. It is pure so that what it does
// to someone's plan can be read and tested before it ever runs on one:
//
//   • planner-salary — if the user typed it, it becomes «Μισθός», monthly, with
//     «ο μισθός μου». If it was only what the app detected, nothing is made: the
//     Incomes page offers the detected salary as a suggestion instead, and a
//     guess never turns itself into a record.
//   • planner-lines with kind "income" — one income each, under the same id, so
//     the Planner's switch for it (`planner-skip`) keeps working. They never had
//     a day, so they come over undated and the page asks for one. From/to become
//     start/end; a season that comes back every year becomes a yearly pause over
//     the months it is *not* in season.
//   • planner-skip and planner-occurrences — whatever was said about `__salary__`
//     is said again about the new salary (`salary:__salary__:2026-09-30` →
//     `income:salary:2026-09-30`), so nothing the user decided is lost.
//
// The old keys are left exactly as they were, for one version, so going back to
// the old Planner still finds its plan; nothing new reads them.

/** The Planner's row id for the salary — see `SALARY_ROW_ID`. Restated so this file reads nothing from the page being rebuilt. */
const PLANNER_SALARY_ROW = "__salary__";

/**
 * The salary's id once it is an income.
 *
 * Fixed rather than random, so the migration is the same whichever device runs
 * it first — two phones running it would otherwise each make a salary.
 */
export const MIGRATED_SALARY_ID = "salary";

export interface MigrationOptions {
  /** Today; the month migrated incomes start counting from. */
  now?: Date;
  /** What `detectSalary` found — fills an amount or day the user left blank. */
  detected?: SalaryPattern;
  /** The salary's name, in the user's language. */
  salaryName?: string;
  /** For the category the records will be written under. */
  categories?: Category[];
}

export interface MigrationResult {
  incomes: Income[];
  skip: string[];
  occurrences: Record<string, OccurrenceOverride>;
}

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value).trim());

/** The typed salary, or undefined when nothing was typed — the guess alone does not count. */
function migrateSalary(stored: unknown, options: MigrationOptions, month: string): Income | undefined {
  const input = stored && typeof stored === "object" ? (stored as { amount?: unknown; day?: unknown }) : {};
  const typedAmount = parseFloat(text(input.amount));
  const typedDay = parseInt(text(input.day), 10);
  if (text(input.amount) === "" && text(input.day) === "") return undefined;

  // Whatever was left blank, the Planner filled in from the detected salary —
  // and planned with it. Carrying over the same figure keeps the plan the same.
  const amount = Number.isFinite(typedAmount) && typedAmount > 0 ? typedAmount : options.detected?.amount;
  const day = Number.isInteger(typedDay) && typedDay >= 1 && typedDay <= 31 ? typedDay : options.detected?.dayOfMonth;
  if (!amount) return undefined;

  return cleanIncome({
    id: MIGRATED_SALARY_ID,
    name: options.salaryName ?? "Μισθός",
    kind: "salary",
    amount,
    frequency: "monthly",
    day,
    start: month,
    isSalary: true,
    categoryId: options.categories ? suggestIncomeCategory("salary", options.categories)?.id : undefined,
  });
}

/** Month numbers, so a season is arithmetic. */
const monthNumber = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthKey = (n: number) => toISOMonth(new Date(Math.floor(n / 12), n % 12, 1));

/** One income line of the plan as an income. */
function migrateLine(line: BudgetLine, options: MigrationOptions, month: string): Income | undefined {
  const from = parseISOMonth(line.from ?? "");
  const base = {
    id: line.id,
    name: line.label,
    kind: "other",
    amount: line.amount,
    frequency: "monthly",
    categoryId: options.categories ? suggestIncomeCategory("other", options.categories)?.id : undefined,
  };

  // A yearly season: in season from `from` to `to` every year, so off for the
  // rest of each year — the months after `to` up to the month before `from`.
  // The Planner reads a season with no end as a single month.
  if (line.yearly && from) {
    const to = parseISOMonth(line.to ?? "") ?? from;
    const length = ((to.getMonth() - from.getMonth() + 12) % 12) + 1;
    const start = monthNumber(from);
    const pause = length >= 12 ? undefined : { from: monthKey(start + length), to: monthKey(start + 11), yearly: true };
    return cleanIncome({ ...base, start: toISOMonth(from), end: line.until, pause });
  }

  // A plain line, or a season that happens once: from/to are start and end.
  // A line with no start "has always been running", which for an income that
  // begins being tracked today means from this month.
  return cleanIncome({ ...base, start: from ? toISOMonth(from) : month, end: line.to });
}

/**
 * The Planner's incomes as incomes, and what was said about the salary
 * re-keyed to it. Every argument is the raw stored value: nothing is trusted on
 * its type, and a malformed line costs that line.
 */
export function migratePlannerIncomes(plannerSalary: unknown, plannerLines: unknown, skip: unknown, occurrences: unknown, options: MigrationOptions = {}): MigrationResult {
  const month = toISOMonth(options.now ?? new Date());

  const lines = Array.isArray(plannerLines)
    ? plannerLines.filter((l): l is BudgetLine => !!l && typeof l === "object" && typeof (l as BudgetLine).id === "string" && (l as BudgetLine).kind === "income" && Number.isFinite((l as BudgetLine).amount))
    : [];

  const salary = migrateSalary(plannerSalary, options, month);
  const incomes: Income[] = [];
  if (salary) incomes.push(salary);
  for (const line of lines) {
    // The salary's fixed id is taken; a line can never actually have it, but a
    // collision must not overwrite the salary.
    if (line.id === MIGRATED_SALARY_ID) continue;
    const income = migrateLine(line, options, month);
    if (income) incomes.push(income);
  }

  const skipped = Array.isArray(skip) ? skip.filter((s): s is string => typeof s === "string") : [];
  const nextSkip = salary && skipped.includes(PLANNER_SALARY_ROW) && !skipped.includes(salary.id) ? [...skipped, salary.id] : skipped;

  const said = occurrences && typeof occurrences === "object" && !Array.isArray(occurrences) ? (occurrences as Record<string, OccurrenceOverride>) : {};
  const nextOccurrences: Record<string, OccurrenceOverride> = { ...said };
  if (salary) {
    const prefix = `salary:${PLANNER_SALARY_ROW}:`;
    for (const [key, value] of Object.entries(said)) {
      if (key.startsWith(prefix)) nextOccurrences[incomeOccurrenceKey(salary.id, key.slice(prefix.length))] = value;
    }
  }

  return { incomes, skip: nextSkip, occurrences: nextOccurrences };
}
