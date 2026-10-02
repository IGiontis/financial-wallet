import { describe, it, expect } from "vitest";
import type { Category } from "../../shared/types/IndexTypes";
import { toISODay } from "../../shared/utils/dates";
import { MIGRATED_SALARY_ID, migratePlannerIncomes } from "./incomeMigration";
import { incomeOccurrences, incomeYear } from "./incomesUtils";

// The one-off move of the Planner's incomes into the Incomes page. Phase 2
// runs it; these say what it will do to a plan before it ever touches one.

const NOW = new Date(2026, 8, 30);
const detected = { amount: 1450, dayOfMonth: 30, occurrences: 5 };

describe("migratePlannerIncomes — the salary", () => {
  it("turns a typed salary into «Μισθός», monthly, «ο μισθός μου»", () => {
    const { incomes } = migratePlannerIncomes({ amount: "1450", day: "30" }, [], [], {}, { now: NOW });
    expect(incomes).toEqual([{ id: MIGRATED_SALARY_ID, name: "Μισθός", kind: "salary", amount: 1450, frequency: "monthly", day: 30, start: "2026-09", isSalary: true }]);
  });

  it("makes nothing from a salary that was only detected — that stays a suggestion", () => {
    expect(migratePlannerIncomes({ amount: "", day: "" }, [], [], {}, { now: NOW, detected }).incomes).toEqual([]);
    expect(migratePlannerIncomes(undefined, [], [], {}, { now: NOW, detected }).incomes).toEqual([]);
  });

  it("fills a half-typed salary from the detected one, as the Planner planned with it", () => {
    expect(migratePlannerIncomes({ amount: "", day: "25" }, [], [], {}, { now: NOW, detected }).incomes[0]).toMatchObject({ amount: 1450, day: 25 });
    expect(migratePlannerIncomes({ amount: 1600, day: "" }, [], [], {}, { now: NOW, detected }).incomes[0]).toMatchObject({ amount: 1600, day: 30 });
  });

  it("names it in the user's language and gives it the salary category", () => {
    const categories = [{ id: "c-sal", name: "Salary", type: "income" } as Category];
    expect(migratePlannerIncomes({ amount: "1450", day: "30" }, [], [], {}, { now: NOW, salaryName: "Salary", categories }).incomes[0]).toMatchObject({ name: "Salary", categoryId: "c-sal" });
  });

  it("carries the salary's switch and its words over to the new id, keeping the old ones", () => {
    const said = { "salary:__salary__:2026-09-30": { state: "received" as const, date: "2026-09-25", amount: 1450 }, "oneoff:x:2026-12-20": { state: "skipped" as const } };
    const result = migratePlannerIncomes({ amount: "1450", day: "30" }, [], ["__salary__", "line-1"], said, { now: NOW });
    expect(result.skip).toEqual(["__salary__", "line-1", "salary"]);
    expect(result.occurrences).toEqual({ ...said, "income:salary:2026-09-30": { state: "received", date: "2026-09-25", amount: 1450 } });
  });

  it("re-keys nothing when no salary is made", () => {
    const said = { "salary:__salary__:2026-09-30": { state: "waiting" as const } };
    const result = migratePlannerIncomes({ amount: "" }, [], ["__salary__"], said, { now: NOW, detected });
    expect(result).toEqual({ incomes: [], skip: ["__salary__"], occurrences: said });
  });
});

describe("migratePlannerIncomes — the income lines", () => {
  it("makes one undated income per income line, under the same id, and leaves expenses alone", () => {
    const lines = [
      { id: "l-rent", label: "Ενοίκιο δωματίου", amount: 250, kind: "income" },
      { id: "l-food", label: "Φαγητό", amount: 300, kind: "expense" },
      { id: "l-bad", label: "Broken", amount: "x", kind: "income" },
    ];
    const { incomes } = migratePlannerIncomes(undefined, lines, ["l-rent"], {}, { now: NOW });
    expect(incomes).toEqual([{ id: "l-rent", name: "Ενοίκιο δωματίου", kind: "other", amount: 250, frequency: "monthly", start: "2026-09" }]);
    // Undated: the Planner spreads it over the month as before.
    expect(incomeOccurrences(incomes[0], new Date(2026, 9, 1), new Date(2026, 9, 31))[0]).toMatchObject({ undated: true, forMonth: "2026-10" });
  });

  it("turns a one-off season into start and end", () => {
    const { incomes } = migratePlannerIncomes(undefined, [{ id: "l1", label: "Σεζόν", amount: 900, kind: "income", from: "2027-06", to: "2027-09" }], [], {}, { now: NOW });
    expect(incomes[0]).toMatchObject({ start: "2027-06", end: "2027-09" });
    expect(incomes[0].pause).toBeUndefined();
  });

  it("turns a yearly season into a yearly pause over the months out of season", () => {
    // Ski lessons December to April, every year, until 2029.
    const line = { id: "ski", label: "Ski", amount: 500, kind: "income", from: "2025-12", to: "2026-04", yearly: true, until: "2029-04" };
    const { incomes } = migratePlannerIncomes(undefined, [line], [], {}, { now: NOW });
    expect(incomes[0]).toMatchObject({ start: "2025-12", end: "2029-04", pause: { from: "2026-05", to: "2026-11", yearly: true } });

    // A second way: the months it actually comes are exactly December to April.
    const months = incomeOccurrences({ ...incomes[0], day: 1 }, new Date(2026, 0, 1), new Date(2027, 11, 31)).map((o) => toISODay(o.date).slice(0, 7));
    expect(months).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-12"]);
    // And so a year brings five months' worth.
    expect(incomeYear(incomes, [], new Date(2026, 4, 1)).total).toBe(500 * 5);
  });

  it("reads a yearly season with no end as a single month every year", () => {
    const { incomes } = migratePlannerIncomes(undefined, [{ id: "bonus", label: "Bonus", amount: 800, kind: "income", from: "2026-12", yearly: true }], [], {}, { now: NOW });
    expect(incomes[0].pause).toEqual({ from: "2027-01", to: "2027-11", yearly: true });
    expect(incomeYear(incomes, [], NOW).total).toBe(800);
  });

  it("keeps a full-year season unpaused", () => {
    const { incomes } = migratePlannerIncomes(undefined, [{ id: "all", label: "All", amount: 10, kind: "income", from: "2026-01", to: "2026-12", yearly: true }], [], {}, { now: NOW });
    expect(incomes[0].pause).toBeUndefined();
  });

  it("puts the salary first and never lets a line overwrite it", () => {
    const { incomes } = migratePlannerIncomes({ amount: "1450", day: "30" }, [{ id: "salary", label: "Clash", amount: 1, kind: "income" }, { id: "l2", label: "Rent", amount: 400, kind: "income" }], [], {}, { now: NOW });
    expect(incomes.map((i) => `${i.id}:${i.name}`)).toEqual(["salary:Μισθός", "l2:Rent"]);
  });
});
