import { describe, it, expect } from "vitest";
import { incomesBillsYears, incomesVsBills, monthSource } from "./incomesVsBills";
import { computeBillStatus, yearAhead } from "../bills/billsUtils";
import { monthSummary, resolveIncomes, type Income } from "../incomes/incomesUtils";
import type { Bill, BillPayment, Transaction } from "../../shared/types/IndexTypes";

// 2026, read on 15 October. A salary of 1.500 on the 1st with «Ήρθε» records
// for January–September (August's came short, 1.420; nothing for September is
// written down), a rent income of 300 from March every two months, a yearly
// bonus of 800 in December, and three bills: a monthly 60 paid every month up
// to September, water every 2 months from January (45, paid in Jan, Mar, May,
// Jul, Sep) and a yearly insurance of 420 in June, paid.
//
// Every expected figure is worked out by hand in the comments; then a second
// route checks it: payments and records summed straight off the lists, the
// pages' own month functions, the year against its months.

const NOW = new Date(2026, 9, 15);
const day = (m: number, d = 1) => new Date(2026, m, d);

const income = (over: Partial<Income>): Income => ({ id: "salary", name: "Μισθός", kind: "salary", amount: 1500, frequency: "monthly", day: 1, start: "2025-01", ...over }) as Income;
const SALARY = income({ isSalary: true });
const RENT = income({ id: "rent", name: "Ενοίκιο", kind: "rent", amount: 300, every: 2, start: "2026-03", day: 5 });
const BONUS = income({ id: "bonus", name: "Μπόνους", kind: "other", amount: 800, frequency: "yearly", month: 11, day: 20, start: "2025-12" });
const INCOMES = [SALARY, RENT, BONUS];

let n = 0;
const arrival = (incomeId: string, due: Date, amount: number, on = due): Transaction =>
  ({ id: `i${++n}`, userId: "u", type: "income", categoryId: "salary", amount, description: "", date: on, createdAt: on, updatedAt: on, incomeId, incomeDue: `2026-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}` }) as Transaction;

// Salary Jan–Aug (August short), September not written down. Rent March, May, July, September (on the 5th).
const RECORDS: Transaction[] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((m) => arrival("salary", day(m), 1500)),
  arrival("salary", day(7), 1420),
  ...[2, 4, 6, 8].map((m) => arrival("rent", day(m, 5), 300)),
  // An income record typed on the Transactions screen: not an «Ήρθε», not counted.
  { id: "loose", userId: "u", type: "income", categoryId: "salary", amount: 999, description: "", date: day(9, 2), createdAt: day(9, 2), updatedAt: day(9, 2) } as Transaction,
];

const bill = (over: Partial<Bill>): Bill =>
  ({ id: "phone", userId: "u", name: "Κινητό", amount: 60, categoryId: "c", frequency: "monthly", dueDay: 5, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1), ...over }) as Bill;
const pay = (billId: string, periodKey: string, amount: number, paidDate: Date): BillPayment => ({ id: `p${++n}`, userId: "u", billId, periodKey, amount, paidDate, createdAt: paidDate });

const PHONE = bill({});
const WATER = bill({ id: "water", name: "Νερό", amount: 45, intervalCount: 2, dueDay: 10 });
const INSURANCE = bill({ id: "ins", name: "Ασφάλεια", amount: 420, frequency: "yearly", dueDay: 15, dueMonth: 5, anchorDate: new Date(2026, 0, 1) });

const PAYMENTS: BillPayment[] = [
  // The phone, January to September, on its 5th — March's paid at 62,30.
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((m) => pay("phone", `2026-${String(m + 1).padStart(2, "0")}`, m === 2 ? 62.3 : 60, day(m, 5))),
  // Water every other month from January.
  ...[0, 2, 4, 6, 8].map((m) => pay("water", `2026-${String(m + 1).padStart(2, "0")}`, 45, day(m, 10))),
  pay("ins", "2026", 420, day(5, 15)),
];

const BILLS = [PHONE, WATER, INSURANCE].map((b) => computeBillStatus(b, PAYMENTS.filter((p) => p.billId === b.id), NOW));
const INPUT = { incomes: INCOMES, transactions: RECORDS, bills: BILLS, now: NOW };

describe("the source switch", () => {
  it("is actual before this month, scheduled from it on", () => {
    expect(monthSource(day(8), NOW)).toBe("actual");
    expect(monthSource(day(9), NOW)).toBe("scheduled");
    expect(monthSource(day(11), NOW)).toBe("scheduled");
    expect(monthSource(new Date(2025, 11, 1), NOW)).toBe("actual");
  });
});

describe("a year of incomes against bills", () => {
  const year = incomesVsBills(2026, INPUT);
  const at = (m: number) => year.months[m];

  it("has the twelve months, each marked actual or scheduled", () => {
    expect(year.months.map((m) => m.key)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
    expect(year.months.map((m) => m.source)).toEqual([...Array(9).fill("actual"), ...Array(3).fill("scheduled")]);
  });

  it("brings in, by hand: what came in the months gone by, what is expected from October", () => {
    expect(year.months.map((m) => m.income)).toEqual([
      1500, 1500, 1800, 1500, 1800, 1500, 1800, 1420,
      // September: the rent came, the salary is not written down — actual is 300, not 1.800.
      300,
      // October: salary (not yet written down, expected 1.500). November: salary + rent. December: salary + bonus.
      1500, 1800, 2300,
    ]);
  });

  it("pays out, by hand: what was paid, and from October what each month is due", () => {
    expect(year.months.map((m) => m.bills)).toEqual([
      105, 60, 107.3, 60, 105, 480, 105, 60, 105,
      // October: phone. November: phone + water (every 2 months, whole in the month it lands). December: phone.
      60, 105, 60,
    ]);
  });

  it("leaves each month its income less its bills, and the year adds up its months", () => {
    for (const m of year.months) expect(m.difference).toBeCloseTo(m.income - m.bills, 10);
    expect(at(5).difference).toBe(1020);
    expect(at(8).difference).toBe(195);
    expect(year.income).toBeCloseTo(year.months.reduce((s, m) => s + m.income, 0), 10);
    expect(year.bills).toBeCloseTo(year.months.reduce((s, m) => s + m.bills, 0), 10);
    expect(year.difference).toBeCloseTo(year.income - year.bills, 10);
    // By hand: incomes 18.720, bills 1.412,30.
    expect([year.income, year.bills, year.difference]).toEqual([18720, 1412.3, 17307.7]);
  });

  it("agrees, for the actual months, with the payments and the «Ήρθε» records summed straight off the lists", () => {
    for (let m = 0; m < 9; m++) {
      const paid = PAYMENTS.filter((p) => p.paidDate.getMonth() === m).reduce((s, p) => s + p.amount, 0);
      expect(at(m).bills).toBeCloseTo(paid, 10);
      const came = RECORDS.filter((t) => t.incomeId && t.incomeDue?.startsWith(`2026-${String(m + 1).padStart(2, "0")}`)).reduce((s, t) => s + t.amount, 0);
      expect(at(m).income).toBeCloseTo(came, 10);
    }
  });

  it("agrees, for the scheduled months, with the Bills page's months and the Incomes page's", () => {
    const ahead = yearAhead(BILLS, NOW, 3);
    expect(year.months.slice(9).map((m) => m.bills)).toEqual(ahead.map((a) => a.total));
    const statuses = resolveIncomes(INCOMES, { transactions: RECORDS, now: NOW }, new Date(2026, 0, 1), new Date(2026, 11, 31));
    for (const m of year.months.slice(9)) expect(m.income).toBe(monthSummary(statuses, m.key).total);
  });

  it("takes a «not this time» and another amount said for a time into the months ahead", () => {
    const said = incomesVsBills(2026, { ...INPUT, overrides: { "income:salary:2026-11-01": { state: "skipped" }, "income:salary:2026-12-01": { amount: 1600 } } as never });
    expect(said.months[10].income).toBe(300);
    expect(said.months[11].income).toBe(2400);
    // The months before are untouched.
    expect(said.months.slice(0, 10)).toEqual(year.months.slice(0, 10));
  });

  it("keeps a switched-off income's and bill's past, and drops their future", () => {
    const off = incomesVsBills(2026, {
      ...INPUT,
      incomes: [SALARY, { ...RENT, active: false }, BONUS],
      bills: BILLS.map((b) => (b.id === "water" ? { ...b, isActive: false } : b)),
    });
    // The rent that came and the water that was paid still did.
    expect(off.months.slice(0, 9)).toEqual(year.months.slice(0, 9));
    // November had both: the rent's 300 and the water's 45 are gone from it.
    expect([off.months[10].income, off.months[10].bills]).toEqual([1500, 60]);
  });

  it("keeps what already came in and was paid this month when the income or bill is switched off afterwards", () => {
    // October: the salary arrives on the 3rd (1.500) and the phone is paid on the 5th (60); then both are switched off.
    const records = [...RECORDS, arrival("salary", day(9), 1500, day(9, 3))];
    const payments = [...PAYMENTS, pay("phone", "2026-10", 60, day(9, 5))];
    const bills = [PHONE, WATER, INSURANCE].map((b) => computeBillStatus(b, payments.filter((p) => p.billId === b.id), NOW));
    const on = incomesVsBills(2026, { ...INPUT, transactions: records, bills });
    const off = incomesVsBills(2026, {
      ...INPUT,
      transactions: records,
      incomes: [{ ...SALARY, active: false }, RENT, BONUS],
      bills: bills.map((b) => (b.id === "phone" ? { ...b, isActive: false } : b)),
    });
    expect(off.months[9].source).toBe("scheduled");
    expect([off.months[9].income, off.months[9].bills]).toEqual([1500, 60]);
    expect([on.months[9].income, on.months[9].bills]).toEqual([1500, 60]);
    // A second way: October's «Ήρθε» records and payments, summed straight off the lists.
    const came = records.filter((t) => t.incomeDue?.startsWith("2026-10")).reduce((s, t) => s + t.amount, 0);
    const paid = payments.filter((p) => p.paidDate.getMonth() === 9).reduce((s, p) => s + p.amount, 0);
    expect([off.months[9].income, off.months[9].bills]).toEqual([came, paid]);
    // What is still to come does go: November without the salary is the rent alone, without the phone the water alone.
    expect([off.months[10].income, off.months[10].bills]).toEqual([300, 45]);
  });

  it("gives a past month the same figures whatever day it is read on", () => {
    const later = incomesVsBills(2026, { ...INPUT, now: new Date(2026, 11, 28) });
    expect(later.months.slice(0, 9)).toEqual(year.months.slice(0, 9));
    expect(later.months[9].source).toBe("actual");
    // October read in December: actual — the salary nobody wrote down is 0 now, not 1.500.
    expect(later.months[9].income).toBe(0);
  });

  it("is all zeros for a year nothing runs in", () => {
    const empty = incomesVsBills(2024, INPUT);
    expect(empty.months.every((m) => m.income === 0 && m.bills === 0 && m.difference === 0)).toBe(true);
  });
});

describe("the year picker", () => {
  it("runs from 2024, or the earliest income's start, to next year", () => {
    expect(incomesBillsYears(INCOMES, NOW)).toEqual([2024, 2025, 2026, 2027]);
    expect(incomesBillsYears([income({ start: "2022-05" })], NOW)).toEqual([2022, 2023, 2024, 2025, 2026, 2027]);
  });
});
