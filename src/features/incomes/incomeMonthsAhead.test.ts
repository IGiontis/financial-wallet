import { describe, it, expect } from "vitest";
import { incomeMonthItems, incomeMonthsAhead, incomeYear } from "./incomesUtils";
import { monthExtremes } from "../../shared/utils/monthExtremes";
import { monthlyIncome, monthlySalary } from "../../test/incomes";
import type { Transaction } from "../../shared/types/IndexTypes";

// «Οι επόμενοι 12 μήνες» on «Έσοδα»: what each month brings. Read on 26
// October 2026: the salary of 1.450 on the 30th, lessons of 320 off over July
// and August every year, and a bonus of 600 every December.

const NOW = new Date(2026, 9, 26, 12);
const SALARY = monthlySalary(1450, 30);
const LESSONS = monthlyIncome("lessons", "Lessons", 320, 28, { pause: { from: "2027-07", to: "2027-08", yearly: true } });
const BONUS = monthlyIncome("bonus", "Bonus", 600, 20, { frequency: "yearly", month: 11 });
const round2 = (n: number) => Math.round(n * 100) / 100;

describe("the months ahead", () => {
  const months = incomeMonthsAhead([SALARY, LESSONS, BONUS], [], NOW);

  it("are twelve, from this month on", () => {
    expect(months).toHaveLength(12);
    expect(months[0].start).toEqual(new Date(2026, 9, 1));
    expect(months[11].start).toEqual(new Date(2027, 8, 1));
  });

  it("bring what lands in each: the bonus in December, the lessons nowhere in July and August", () => {
    const at = (year: number, month: number) => months.find((m) => m.start.getFullYear() === year && m.start.getMonth() === month)!;
    // By hand.
    expect(at(2026, 11).total).toBe(1450 + 320 + 600);
    expect(at(2027, 0).total).toBe(1450 + 320);
    expect(at(2027, 6).total).toBe(1450);
    expect(at(2027, 7).total).toBe(1450);
    expect(at(2026, 11).count).toBe(3);
  });

  it("add up to the year's own total, to the cent", () => {
    // A second way: the year card's sum, income by income.
    const year = incomeYear([SALARY, LESSONS, BONUS], [], NOW);
    expect(round2(months.reduce((sum, m) => sum + m.total, 0))).toBe(year.total);
    expect(year.total).toBe(12 * 1450 + 10 * 320 + 600);
  });

  it("name the month with the most, and both lean months — tied, so neither alone", () => {
    const { highs, lows } = monthExtremes(months);
    expect(highs.map((m) => [m.start, m.total])).toEqual([[new Date(2026, 11, 1), 2370]]);
    expect(lows.map((m) => [m.start, m.total])).toEqual([
      [new Date(2027, 6, 1), 1450],
      [new Date(2027, 7, 1), 1450],
    ]);
  });

  it("name no 'most' when most months bring the same — that is the usual month, not one that stands out", () => {
    // The lessons alone off in summer: ten months at 1.770, two at 1.450.
    const { highs, lows } = monthExtremes(incomeMonthsAhead([SALARY, LESSONS], [], NOW));
    expect(highs).toEqual([]);
    expect(lows).toHaveLength(2);
  });

  it("name none on a flat year: a salary and nothing else", () => {
    expect(monthExtremes(incomeMonthsAhead([SALARY], [], NOW))).toEqual({ highs: [], lows: [] });
  });

  it("leave out an archived income", () => {
    const off = incomeMonthsAhead([SALARY, { ...BONUS, active: false }], [], NOW);
    expect(off.find((m) => m.start.getMonth() === 11)!.total).toBe(1450);
  });
});

describe("a month opened", () => {
  it("lists each time an income is expected, soonest first, adding up to its bar", () => {
    const december = new Date(2026, 11, 1);
    const items = incomeMonthItems([SALARY, LESSONS, BONUS], [], december);
    expect(items.map((i) => [i.income.name, i.date.getDate(), i.amount])).toEqual([
      ["Bonus", 20, 600],
      ["Lessons", 28, 320],
      ["Salary", 30, 1450],
    ]);
    // A second way: the bar's own figure for December.
    const bar = incomeMonthsAhead([SALARY, LESSONS, BONUS], [], NOW).find((m) => m.start.getTime() === december.getTime())!;
    expect(round2(items.reduce((sum, i) => sum + i.amount, 0))).toBe(bar.total);
  });

  it("is empty in a paused month for the paused income, and says nothing of it", () => {
    expect(incomeMonthItems([LESSONS], [], new Date(2027, 6, 1))).toEqual([]);
  });
});

describe("the months ahead, with cents, a variable income and a weekly one", () => {
  // Tips of 37,35 a week; tutoring that varies, last three times 101,10 / 99,95 / 120,33.
  const TIPS = monthlyIncome("tips", "Tips", 37.35, 0, { frequency: "weekly", day: 4 });
  const TUTOR = monthlyIncome("tutor", "Tutor", 100, 12, { variable: true });
  const came = (amount: number, month: number) =>
    ({ id: `t${month}`, userId: "u", type: "income", amount, categoryId: "c", description: "Tutor", date: new Date(2026, month, 12), createdAt: new Date(2026, month, 12), updatedAt: new Date(2026, month, 12), incomeId: "tutor", incomeDue: `2026-${String(month + 1).padStart(2, "0")}-12` }) as Transaction;
  const records = [came(101.1, 6), came(99.95, 7), came(120.33, 8)];

  it("add up to the year's own total, to the cent", () => {
    const months = incomeMonthsAhead([SALARY, TIPS, TUTOR], records, NOW);
    const year = incomeYear([SALARY, TIPS, TUTOR], records, NOW);
    // A second way: income by income over the year, against month by month.
    expect(round2(months.reduce((sum, m) => sum + m.total, 0))).toBe(year.total);
    // The tutoring at the mean of its last three: 107,13 a month.
    expect(incomeMonthItems([TUTOR], records, new Date(2026, 10, 1))[0].amount).toBe(107.13);
    expect(months.some((m) => m.approximate)).toBe(true);
  });
});
