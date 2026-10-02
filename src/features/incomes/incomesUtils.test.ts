import { describe, it, expect } from "vitest";
import type { Category, Transaction } from "../../shared/types/IndexTypes";
import { toISODay } from "../../shared/utils/dates";
import {
  arrivalTransaction,
  bankAnswerDate,
  cleanIncomes,
  createIncomeResolver,
  expectedAmount,
  incomeHistory,
  incomeOccurrences,
  incomeRows,
  incomeStatus,
  incomeWindow,
  incomeYear,
  isOnReadingDay,
  lateCount,
  monthSummary,
  resolveIncomes,
  salarySuggestion,
  suggestIncomeCategory,
  upsertIncome,
  type Income,
  type IncomeContext,
} from "./incomesUtils";

// The rules that decide "has it come?", with the money figures confirmed a
// second way wherever there is one: the month bar against the list it sits
// over, the year against its per-income rows, the mean against its arrivals.

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const days = (list: { date: Date }[]) => list.map((o) => toISODay(o.date));

let txSeq = 0;
const tx = (amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++txSeq}`, userId: "u1", amount, type: "income", categoryId: "c-other", date, description: "", createdAt: date, updatedAt: date, ...extra }) as Transaction;

const income = (extra: Partial<Income> = {}): Income => ({ id: "inc", name: "Μισθός", kind: "salary", amount: 1000, frequency: "monthly", day: 15, start: "2026-01", ...extra });

/** The status of one income's occurrence on `due`, with the given records and words. */
function statusOn(inc: Income, due: Date, ctx: Partial<IncomeContext> & { now: Date }) {
  const occurrence = incomeOccurrences(inc, due, due)[0];
  expect(occurrence, `no occurrence on ${toISODay(due)}`).toBeDefined();
  return incomeStatus(occurrence, inc, { transactions: [], ...ctx });
}

// ─── The design's sample ─────────────────────────────────────────────────────
// Wednesday 30 September 2026. Salary 1.450 on the 30th (came Fri 25/9), rent
// 400 on the 5th, allowance 70 on the 20th, private lessons variable ≈320 on
// the 28th — off July and August every year — two days late.

const NOW = new Date(2026, 8, 30, 10, 0);
const salary: Income = { id: "sal", name: "Μισθός", kind: "salary", amount: 1450, frequency: "monthly", day: 30, start: "2025-09", isSalary: true, categoryId: "c-salary", accountId: "eurobank" };
const rent: Income = { id: "rent", name: "Ενοίκιο που εισπράττω", kind: "rent", amount: 400, frequency: "monthly", day: 5, start: "2025-09", accountId: "revolut" };
const allowance: Income = { id: "allow", name: "Επίδομα", kind: "allowance", amount: 70, frequency: "monthly", day: 20, start: "2025-09" };
const lessons: Income = {
  id: "tut",
  name: "Ιδιαίτερα μαθήματα",
  kind: "work",
  amount: 300,
  variable: true,
  frequency: "monthly",
  day: 28,
  start: "2025-09",
  pause: { from: "2026-07", to: "2026-08", yearly: true },
  categoryId: "c-free",
  accountId: "cash",
};
const sampleIncomes = [salary, rent, allowance, lessons];
const sampleTransactions = [
  tx(1450, d(2026, 9, 25), { incomeId: "sal", incomeDue: "2026-09-30", categoryId: "c-salary" }),
  tx(400, d(2026, 9, 5), { incomeId: "rent", incomeDue: "2026-09-05" }),
  tx(70, d(2026, 9, 21), { incomeId: "allow", incomeDue: "2026-09-20" }),
  // The lessons' last three arrivals: (320 + 340 + 300) / 3 = 320.
  tx(320, d(2026, 4, 28), { incomeId: "tut", incomeDue: "2026-04-28", categoryId: "c-free" }),
  tx(340, d(2026, 5, 28), { incomeId: "tut", incomeDue: "2026-05-28", categoryId: "c-free" }),
  tx(300, d(2026, 6, 29), { incomeId: "tut", incomeDue: "2026-06-28", categoryId: "c-free" }),
];
const sampleStatuses = () => {
  const { from, to } = incomeWindow(NOW);
  return resolveIncomes(sampleIncomes, { transactions: sampleTransactions, now: NOW }, from, to);
};

// ─── Dates ───────────────────────────────────────────────────────────────────

describe("incomeOccurrences", () => {
  it("keeps a salary on the 30th on the 30th after February, rather than walking back to the 28th", () => {
    expect(days(incomeOccurrences(income({ day: 30 }), d(2027, 1, 1), d(2027, 4, 30)))).toEqual(["2027-01-30", "2027-02-28", "2027-03-30", "2027-04-30"]);
  });

  it("reads the 31st as the month's last day, including a leap February", () => {
    const inc = income({ day: 31, start: "2027-01" });
    expect(days(incomeOccurrences(inc, d(2027, 2, 1), d(2027, 4, 30)))).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(days(incomeOccurrences(inc, d(2028, 2, 1), d(2028, 2, 29)))).toEqual(["2028-02-29"]);
  });

  it("puts a yearly 29 February on the 28th in a common year and the 29th in a leap one", () => {
    const inc = income({ frequency: "yearly", day: 29, month: 1, start: "2027-01" });
    expect(days(incomeOccurrences(inc, d(2027, 1, 1), d(2028, 12, 31)))).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("counts every N months from the start, also when the window starts mid-cycle", () => {
    const inc = income({ day: 10, every: 3, start: "2026-01" });
    expect(days(incomeOccurrences(inc, d(2026, 1, 1), d(2026, 12, 31)))).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
    expect(days(incomeOccurrences(inc, d(2026, 5, 1), d(2027, 1, 31)))).toEqual(["2026-07-10", "2026-10-10", "2027-01-10"]);
  });

  it("counts every N years from the start", () => {
    const inc = income({ frequency: "yearly", day: 20, month: 11, every: 2, start: "2025-01" });
    expect(days(incomeOccurrences(inc, d(2025, 1, 1), d(2030, 12, 31)))).toEqual(["2025-12-20", "2027-12-20", "2029-12-20"]);
  });

  it("counts every second Friday from the first Friday on or after the start", () => {
    // Wednesday 2 Sept: the first Friday is the 4th.
    const inc = income({ frequency: "weekly", day: 5, every: 2, start: "2026-09-02" });
    expect(days(incomeOccurrences(inc, d(2026, 9, 1), d(2026, 10, 20)))).toEqual(["2026-09-04", "2026-09-18", "2026-10-02", "2026-10-16"]);
    expect(days(incomeOccurrences(inc, d(2026, 9, 10), d(2026, 10, 20)))).toEqual(["2026-09-18", "2026-10-02", "2026-10-16"]);
  });

  it("comes nothing before its start or after its end month", () => {
    const inc = income({ day: 10, start: "2026-03", end: "2026-05" });
    expect(days(incomeOccurrences(inc, d(2026, 1, 1), d(2026, 12, 31)))).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
  });

  it("skips the paused months every year, starting from the pause's first year", () => {
    const occurrences = incomeOccurrences(lessons, d(2026, 5, 1), d(2027, 9, 30)).map((o) => o.due);
    expect(occurrences).not.toContain("2026-07-28");
    expect(occurrences).not.toContain("2026-08-28");
    expect(occurrences).not.toContain("2027-07-28");
    expect(occurrences).not.toContain("2027-08-28");
    expect(occurrences).toContain("2026-06-28");
    expect(occurrences).toContain("2026-09-28");
    expect(occurrences).toContain("2027-06-28");
    // Before the pause was set, the summer was not off.
    expect(days(incomeOccurrences(lessons, d(2025, 7, 1), d(2025, 12, 31)))).toEqual(["2025-09-28", "2025-10-28", "2025-11-28", "2025-12-28"]);
  });

  it("stops for good on a pause with no end", () => {
    const inc = income({ pause: { from: "2026-04" } });
    expect(days(incomeOccurrences(inc, d(2026, 1, 1), d(2026, 12, 31)))).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("dates an undated income on the 1st of each month and says so", () => {
    const [first] = incomeOccurrences(income({ day: undefined }), d(2026, 9, 1), d(2026, 9, 30));
    expect(first).toMatchObject({ due: "2026-09-01", forMonth: "2026-09", undated: true, key: "income:inc:2026-09-01" });
  });

  it("keys each occurrence the way the Planner keeps its words", () => {
    expect(incomeOccurrences(salary, d(2026, 9, 1), d(2026, 9, 30))[0]).toMatchObject({ key: "income:sal:2026-09-30", due: "2026-09-30", forMonth: "2026-09", amount: 1450 });
  });
});

// ─── Status, in the documented order ─────────────────────────────────────────

describe("the status of an occurrence", () => {
  const inc = income();
  const due = d(2026, 9, 15);

  it("1. a record with its incomeId beats everything said and found", () => {
    const status = statusOn(inc, due, {
      now: d(2026, 9, 30),
      transactions: [tx(990, d(2026, 9, 14), { incomeId: "inc", incomeDue: "2026-09-15" }), tx(1000, d(2026, 9, 15))],
      overrides: { "income:inc:2026-09-15": { state: "skipped" } },
    });
    expect(status.state).toBe("arrived");
    expect(status.arrival).toMatchObject({ amount: 990, manual: false });
  });

  it("2. what was said beats a record found near the day", () => {
    const status = statusOn(inc, due, { now: d(2026, 9, 30), transactions: [tx(1000, d(2026, 9, 15))], overrides: { "income:inc:2026-09-15": { state: "skipped" } } });
    expect(status.state).toBe("skipped");
  });

  it("2. «it came», said without a record, is an arrival at what was said", () => {
    const status = statusOn(inc, due, { now: d(2026, 9, 30), overrides: { "income:inc:2026-09-15": { state: "received", date: "2026-09-12", amount: 950 } } });
    expect(status).toMatchObject({ state: "arrived", earlyDays: 3 });
    expect(status.arrival).toMatchObject({ amount: 950, manual: true });
  });

  it("3. finds an untagged record from 10 days early to 10 days late, and not a day further", () => {
    const now = d(2026, 9, 30);
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 5))] }).state).toBe("found");
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 4))] }).state).toBe("late");
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 25))] }).state).toBe("found");
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 26))] }).state).toBe("late");
  });

  it("3. finds an amount within 15% either way, and not beyond", () => {
    const now = d(2026, 9, 30);
    const at = (amount: number) => statusOn(inc, due, { now, transactions: [tx(amount, due)] }).state;
    expect([at(1150), at(850)]).toEqual(["found", "found"]);
    expect([at(1151), at(849)]).toEqual(["late", "late"]);
  });

  it("3. does not find a record dated after today", () => {
    expect(statusOn(inc, due, { now: d(2026, 9, 14), transactions: [tx(1000, due)] }).state).toBe("due");
  });

  it("3. finds a variable income by its category, at any amount", () => {
    const variable = income({ variable: true, categoryId: "c-free" });
    const now = d(2026, 9, 30);
    expect(statusOn(variable, due, { now, transactions: [tx(2600, due, { categoryId: "c-free" })] }).state).toBe("found");
    expect(statusOn(variable, due, { now, transactions: [tx(1000, due, { categoryId: "c-other" })] }).state).toBe("late");
  });

  it("3. never finds a record already tagged — for this income's other time, or for another income", () => {
    const now = d(2026, 9, 30);
    expect(statusOn(inc, due, { now, transactions: [tx(1000, due, { incomeId: "other", incomeDue: "2026-09-15" })] }).state).toBe("late");
  });

  it("3. lets one record settle one occurrence, the earliest", () => {
    const a = income({ id: "a" });
    const b = income({ id: "b", day: 16 });
    const statuses = resolveIncomes([a, b], { transactions: [tx(1000, d(2026, 9, 15))], now: d(2026, 9, 30) }, d(2026, 9, 1), d(2026, 9, 30));
    expect(statuses.map((s) => `${s.incomeId}:${s.state}`)).toEqual(["a:found", "b:late"]);
  });

  it("3. «wait» stops the found guess", () => {
    const status = statusOn(inc, due, { now: d(2026, 9, 30), transactions: [tx(1000, due)], overrides: { "income:inc:2026-09-15": { state: "waiting" } } });
    expect(status.state).toBe("late");
  });

  it("4. asks about the bank when the reading is on or after the earliest day it could have come", () => {
    const now = d(2026, 9, 16);
    expect(statusOn(inc, due, { now, lastReadingAt: new Date(2026, 8, 5, 21, 0) }).state).toBe("ask");
    expect(statusOn(inc, due, { now, lastReadingAt: new Date(2026, 8, 4, 21, 0) }).state).toBe("late");
  });

  it("4. does not ask once something was said, nor when a record was found", () => {
    const now = d(2026, 9, 16);
    const reading = d(2026, 9, 14);
    expect(statusOn(inc, due, { now, lastReadingAt: reading, overrides: { "income:inc:2026-09-15": { state: "waiting" } } }).state).toBe("late");
    expect(statusOn(inc, due, { now, lastReadingAt: reading, transactions: [tx(1000, d(2026, 9, 13))] }).state).toBe("found");
  });

  it("4. asks about one not due yet, when the reading is inside its early window", () => {
    // Due on the 15th, banks read on the 5th: it may already be in them.
    expect(statusOn(inc, d(2026, 10, 15), { now: d(2026, 10, 6), lastReadingAt: d(2026, 10, 5) }).state).toBe("ask");
  });

  it("5. is late for 25 days, then goes to history as missed", () => {
    const late = statusOn(inc, due, { now: d(2026, 10, 10) });
    expect(late).toMatchObject({ state: "late", lateDays: 25, canArrive: true });
    expect(statusOn(inc, due, { now: d(2026, 10, 11) })).toMatchObject({ state: "missed", lateDays: 26, canArrive: false });
  });

  it("6. offers «Ήρθε» from 10 days before the day, not 11", () => {
    expect(statusOn(inc, due, { now: d(2026, 9, 5) })).toMatchObject({ state: "due", daysUntil: 10, canArrive: true });
    expect(statusOn(inc, due, { now: d(2026, 9, 4) })).toMatchObject({ state: "upcoming", daysUntil: 11, canArrive: false });
    expect(statusOn(inc, due, { now: due })).toMatchObject({ state: "due", daysUntil: 0 });
  });

  it("says «N days early» from 2 days early, and nothing for one", () => {
    const now = d(2026, 9, 30);
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 13), { incomeId: "inc", incomeDue: "2026-09-15" })] }).earlyDays).toBe(2);
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 14), { incomeId: "inc", incomeDue: "2026-09-15" })] }).earlyDays).toBeUndefined();
    expect(statusOn(inc, due, { now, transactions: [tx(1000, d(2026, 9, 17), { incomeId: "inc", incomeDue: "2026-09-15" })] }).lateDays).toBe(2);
  });

  it("measures a moved day from the new day, and uses an amount said for this time", () => {
    const overrides = { "income:inc:2026-09-15": { date: "2026-09-20", amount: 1200 } };
    expect(statusOn(inc, due, { now: d(2026, 9, 18), overrides })).toMatchObject({ state: "due", daysUntil: 2, expected: 1200, overridden: true });
    expect(statusOn(inc, due, { now: d(2026, 9, 23), overrides })).toMatchObject({ state: "late", lateDays: 3 });
    // The record is looked for around the new day and at the new amount.
    expect(statusOn(inc, due, { now: d(2026, 9, 30), overrides, transactions: [tx(1200, d(2026, 9, 29))] }).state).toBe("found");
  });

  it("keeps a record written against the old day when the day is changed in the same month", () => {
    const moved = income({ day: 28 });
    const status = statusOn(moved, d(2026, 9, 28), { now: d(2026, 9, 30), transactions: [tx(1000, d(2026, 9, 29), { incomeId: "inc", incomeDue: "2026-09-30" })] });
    expect(status.state).toBe("arrived");
  });

  it("is never late without a day, and is over with its month", () => {
    const undated = income({ day: undefined });
    expect(statusOn(undated, d(2026, 9, 1), { now: d(2026, 9, 30) })).toMatchObject({ state: "due", canArrive: true });
    expect(statusOn(undated, d(2026, 9, 1), { now: d(2026, 10, 1) }).state).toBe("missed");
    expect(statusOn(undated, d(2026, 9, 1), { now: d(2026, 9, 30), transactions: [tx(1000, d(2026, 9, 22))] }).state).toBe("found");
  });
});

// ─── Variable amounts ────────────────────────────────────────────────────────

describe("a variable income's figure", () => {
  const arrival = (amount: number, month: number) => tx(amount, d(2026, month, 28), { incomeId: "tut", incomeDue: `2026-${String(month).padStart(2, "0")}-28` });

  it("stays the estimate until it has come three times", () => {
    expect(expectedAmount(lessons, [arrival(320, 4), arrival(340, 5)])).toMatchObject({ amount: 300, estimated: true });
  });

  it("is the mean of the three, (320 + 340 + 300) / 3 = 320, once it has", () => {
    const result = expectedAmount(lessons, [arrival(320, 4), arrival(340, 5), arrival(300, 6)]);
    expect(result).toMatchObject({ amount: 320, estimated: false });
    // A second way: the mean times three is their sum.
    expect(result.amount * 3).toBe(320 + 340 + 300);
  });

  it("takes the last three, dropping the oldest", () => {
    expect(expectedAmount(lessons, [arrival(500, 3), arrival(320, 4), arrival(340, 5), arrival(300, 6)]).amount).toBe(320);
  });

  it("counts two records for one time as one arrival", () => {
    const split = [arrival(320, 4), arrival(340, 5), tx(100, d(2026, 6, 28), { incomeId: "tut", incomeDue: "2026-06-28" }), tx(200, d(2026, 6, 29), { incomeId: "tut", incomeDue: "2026-06-28" })];
    expect(expectedAmount(lessons, split).amount).toBe(320);
  });

  it("is expected at its mean on the list, marked as approximate", () => {
    const sept = sampleStatuses().find((s) => s.key === "income:tut:2026-09-28")!;
    expect(sept).toMatchObject({ state: "late", lateDays: 2, expected: 320, approximate: true });
  });
});

// ─── The month bar and the list ─────────────────────────────────────────────

describe("September in the design's sample", () => {
  it("came 1.920 of 2.240, with ≈320 missing", () => {
    const month = monthSummary(sampleStatuses(), "2026-09");
    expect(month).toMatchObject({ arrived: 1920, missing: 320, asking: 0, total: 2240, arrivedCount: 3, count: 4, approximate: true });
    // A second way: the arrivals' own amounts, and the parts adding to the whole.
    expect(month.arrived).toBe(1450 + 400 + 70);
    expect(month.arrived + month.missing + month.asking).toBe(month.total);
    expect(month.segments.reduce((sum, s) => sum + s.amount, 0)).toBe(month.total);
  });

  it("reconciles with the list under it: «Περιμένεις» plus «Ήρθαν» is the month", () => {
    const statuses = sampleStatuses();
    const rows = incomeRows(sampleIncomes, statuses, NOW);
    const waiting = rows.filter((r) => r.section === "waiting");
    const arrived = rows.filter((r) => r.section === "arrived");
    expect(waiting.map((r) => r.income.id)).toEqual(["tut"]);
    expect(arrived.map((r) => r.income.id).sort()).toEqual(["allow", "rent", "sal"]);

    const waitingTotal = waiting.flatMap((r) => r.open).reduce((sum, s) => sum + s.expected, 0);
    const arrivedTotal = arrived.flatMap((r) => r.settled).reduce((sum, s) => sum + s.arrival!.amount, 0);
    expect(waitingTotal).toBe(320);
    expect(arrivedTotal).toBe(1920);
    expect(waitingTotal + arrivedTotal).toBe(monthSummary(statuses, "2026-09").total);
  });

  it("says the salary came 5 days early, and is next on Friday 30 October", () => {
    const row = incomeRows(sampleIncomes, sampleStatuses(), NOW).find((r) => r.income.id === "sal")!;
    expect(row.focus).toMatchObject({ state: "arrived", earlyDays: 5 });
    expect(toISODay(row.next!.date)).toBe("2026-10-30");
  });

  it("counts the late lessons for the badge, and nothing else", () => {
    expect(lateCount(sampleStatuses())).toBe(1);
  });

  it("puts an arrival in the month it is for: October's salary on 28 September is October's", () => {
    const early = [...sampleTransactions, tx(1450, d(2026, 9, 28), { incomeId: "sal", incomeDue: "2026-10-30" })];
    const { from, to } = incomeWindow(NOW);
    const statuses = resolveIncomes(sampleIncomes, { transactions: early, now: NOW }, from, to);
    expect(monthSummary(statuses, "2026-09").arrived).toBe(1920);
    expect(monthSummary(statuses, "2026-10")).toMatchObject({ arrived: 1450, arrivedCount: 1 });
  });

  it("holds what waits on the bank question out of both sides until it is answered", () => {
    // No salary record, banks read on Monday 28/9: both the salary (earliest
    // 20/9) and the lessons (earliest 18/9) may already be in that reading.
    const withoutSalary = sampleTransactions.slice(1);
    const { from, to } = incomeWindow(NOW);
    const statuses = resolveIncomes(sampleIncomes, { transactions: withoutSalary, now: NOW, lastReadingAt: new Date(2026, 8, 28, 20, 0) }, from, to);
    const month = monthSummary(statuses, "2026-09");
    expect(month).toMatchObject({ arrived: 470, asking: 1450 + 320, missing: 0, total: 2240 });
    // The badge also counts October's rent: due 5/10, so it could have come
    // from 25/9 — before the reading too.
    expect(statuses.filter((s) => s.state === "ask").map((s) => s.key)).toEqual(["income:tut:2026-09-28", "income:sal:2026-09-30", "income:rent:2026-10-05"]);
    expect(lateCount(statuses)).toBe(3);
    // «Όχι ακόμα» on the lessons: waiting, so late again, and not asked twice.
    const answered = resolveIncomes(sampleIncomes, { transactions: withoutSalary, now: NOW, lastReadingAt: new Date(2026, 8, 28, 20, 0), overrides: { "income:tut:2026-09-28": { state: "waiting" } } }, from, to);
    expect(monthSummary(answered, "2026-09")).toMatchObject({ arrived: 470, asking: 1450, missing: 320, total: 2240 });
  });

  it("shows when the salary came over the last six months", () => {
    const found = [d(2026, 4, 30), d(2026, 5, 29), d(2026, 6, 30), d(2026, 7, 30), d(2026, 8, 31)].map((date) => tx(1450, date, { categoryId: "c-salary" }));
    const { from, to } = incomeWindow(NOW);
    const statuses = resolveIncomes(sampleIncomes, { transactions: [...sampleTransactions, ...found], now: NOW }, from, to);
    const chips = incomeHistory(salary, statuses, NOW);
    expect(chips.map((c) => c.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(chips.map((c) => c.status?.arrival?.date.getDate())).toEqual([30, 29, 30, 30, 31, 25]);
    expect(chips.map((c) => c.state)).toEqual(["found", "found", "found", "found", "found", "arrived"]);
    // And the lessons' summer shows as paused, not missing.
    expect(incomeHistory(lessons, statuses, NOW).map((c) => c.state)).toEqual(["arrived", "arrived", "arrived", "paused", "paused", "late"]);
  });
});

describe("the year", () => {
  it("is 1.450×12 + 400×12 + 70×12 + 320×10 = 26.240, ≈2.187 a month", () => {
    const year = incomeYear(sampleIncomes, sampleTransactions, NOW);
    expect(year.total).toBe(26240);
    expect(year.perMonth).toBeCloseTo(2186.67, 2);
    // A second way: the rows, each its count times its figure.
    const byId = Object.fromEntries(year.rows.map((r) => [r.income.id, r]));
    expect([byId.sal.count, byId.rent.count, byId.allow.count, byId.tut.count]).toEqual([12, 12, 12, 10]);
    expect(byId.tut.total).toBe(3200);
    expect(year.rows.reduce((sum, r) => sum + r.each * r.count, 0)).toBe(year.total);
  });
});

// ─── Writing «Ήρθε» ──────────────────────────────────────────────────────────

describe("the transaction «Ήρθε» writes", () => {
  it("is an ordinary income tied to the income and the time it was for", () => {
    const occurrence = incomeOccurrences(lessons, d(2026, 9, 28), d(2026, 9, 28))[0];
    expect(arrivalTransaction(lessons, occurrence, { amount: 320, date: d(2026, 9, 30), categoryId: "c-free", accountId: "cash" })).toEqual({
      amount: 320,
      type: "income",
      categoryId: "c-free",
      date: d(2026, 9, 30),
      description: "Ιδιαίτερα μαθήματα",
      incomeId: "tut",
      incomeDue: "2026-09-28",
      accountId: "cash",
    });
  });

  it("leaves out an empty account rather than storing undefined, and marks a reading-day answer", () => {
    const dto = arrivalTransaction(salary, { due: "2026-09-30" }, { amount: 1450, date: d(2026, 9, 28), categoryId: "c-salary", accountId: "", inReading: true });
    expect("accountId" in dto).toBe(false);
    expect(dto.inReading).toBe(true);
  });

  it("is settled by its own record once written", () => {
    const dto = arrivalTransaction(lessons, { due: "2026-09-28" }, { amount: 330, date: NOW, categoryId: "c-free" });
    const written = tx(dto.amount, dto.date, { ...dto, id: "new" } as Partial<Transaction>);
    const { from, to } = incomeWindow(NOW);
    const statuses = resolveIncomes(sampleIncomes, { transactions: [...sampleTransactions, written], now: NOW }, from, to);
    expect(monthSummary(statuses, "2026-09")).toMatchObject({ arrived: 2250, missing: 0, total: 2250 });
    expect(lateCount(statuses)).toBe(0);
    // Deleting it takes the «Ήρθε» back.
    expect(lateCount(resolveIncomes(sampleIncomes, { transactions: sampleTransactions, now: NOW }, from, to))).toBe(1);
  });
});

describe("answering the bank question", () => {
  it("dates the record no later than the reading's day, and marks it when it is that day", () => {
    const reading = new Date(2026, 8, 28, 20, 30);
    const occurrence = incomeOccurrences(salary, d(2026, 9, 30), d(2026, 9, 30))[0];
    const status = createIncomeResolver([salary], { transactions: [], now: NOW, lastReadingAt: reading })(occurrence);
    expect(status.state).toBe("ask");
    const date = bankAnswerDate(status, reading);
    expect(toISODay(date)).toBe("2026-09-28");
    expect(isOnReadingDay(date, reading)).toBe(true);
    expect(isOnReadingDay(d(2026, 9, 25), reading)).toBe(false);
    // Expected before the reading: its own day.
    const early = { ...status, expectedDate: d(2026, 9, 26) };
    expect(toISODay(bankAnswerDate(early, reading))).toBe("2026-09-26");
  });
});

// ─── The rest ────────────────────────────────────────────────────────────────

describe("the category suggested by kind", () => {
  const cat = (id: string, name: string, type: "income" | "expense" = "income") => ({ id, name, type }) as Category;
  const seeded = [cat("s", "Salary"), cat("f", "Freelance"), cat("g", "Government Aid"), cat("o", "Other Income"), cat("r", "Rent", "expense")];

  it("uses the seeded income category that fits", () => {
    expect(suggestIncomeCategory("salary", seeded)?.id).toBe("s");
    expect(suggestIncomeCategory("work", seeded)?.id).toBe("f");
    expect(suggestIncomeCategory("allowance", seeded)?.id).toBe("g");
  });

  it("never offers the expense «Rent» for a rent collected, and falls back to Other Income", () => {
    expect(suggestIncomeCategory("rent", seeded)?.id).toBe("o");
    expect(suggestIncomeCategory("pension", seeded)?.id).toBe("o");
  });

  it("prefers a category the user made for it, in either language", () => {
    expect(suggestIncomeCategory("rent", [...seeded, cat("mine", "ενοίκια")])?.id).toBe("mine");
    expect(suggestIncomeCategory("pension", [...seeded, cat("p", "Σύνταξη")])?.id).toBe("p");
  });
});

describe("the stored list", () => {
  it("drops what cannot be dated and repairs what is merely odd", () => {
    const list = cleanIncomes([
      salary,
      { id: "x", name: "No start", amount: 10, frequency: "monthly" },
      { id: "y", name: "Bad freq", amount: 10, frequency: "daily", start: "2026-01" },
      { id: "z", name: "Odd", amount: "25", frequency: "monthly", start: "2026-01", kind: "lottery", day: 40, every: 0, accountId: "" },
      null,
      { ...salary, name: "Duplicate id" },
    ]);
    expect(list.map((i) => i.id)).toEqual(["sal", "z"]);
    expect(list[1]).toEqual({ id: "z", name: "Odd", amount: 25, frequency: "monthly", start: "2026-01", kind: "other" });
  });

  it("keeps «ο μισθός μου» on one income only", () => {
    const second = { ...rent, isSalary: true };
    const list = upsertIncome(sampleIncomes, second);
    expect(list.filter((i) => i.isSalary).map((i) => i.id)).toEqual(["rent"]);
    expect(list).toHaveLength(4);
    expect(upsertIncome(list, { ...allowance, id: "new" })).toHaveLength(5);
  });
});

describe("the salary found in the records", () => {
  const months = [d(2026, 5, 29), d(2026, 6, 30), d(2026, 7, 30), d(2026, 8, 31), d(2026, 9, 25)].map((date) => tx(1450, date));

  it("is offered with how many months it was seen and where it starts", () => {
    const suggestion = salarySuggestion(months, NOW);
    expect(suggestion).toMatchObject({ pattern: { amount: 1450, dayOfMonth: 30, occurrences: 5 }, signature: "1450@30", since: "2026-05" });
  });

  it("is not offered again once declined", () => {
    expect(salarySuggestion(months, NOW, ["1450@30"])).toBeUndefined();
  });

  it("ignores records already written by «Ήρθε»", () => {
    const tagged = months.map((t) => ({ ...t, incomeId: "sal" }));
    expect(salarySuggestion(tagged, NOW)).toBeUndefined();
  });
});
