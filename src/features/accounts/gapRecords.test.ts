import { describe, it, expect } from "vitest";
import { expectedByAccount, projectedTotal, readCheckIns, type BalanceCheckIn, type MoneyAccount } from "./accountsUtils";
import { gapEffect, gapOverrun, gapRecordProblem, gapRemaining, gapWrites, type GapRecord } from "./gapRecords";
import { gapTransactionRows } from "./useGapRecords";
import { computeDebtStatus } from "../debts/debtsUtils";
import { isMoneyMove } from "../../shared/utils/moneyModel";
import type { Debt, DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// −73 € on Eurobank at Tuesday's reading; he remembers 68 € of it. What is
// checked here is not the sheet's own arithmetic but what the written records
// do once they are among the transactions: the app's expectation moves by
// what they add up to, the reading taken afterwards reports exactly the rest
// as «χωρίς εγγραφή», and nothing is counted on top of that reading.

const round2 = (n: number) => Math.round(n * 100) / 100;
const accounts: MoneyAccount[] = [
  { id: "euro", name: "Eurobank", kind: "bank", main: true },
  { id: "cash", name: "Μετρητά", kind: "cash" },
];
// Last reading: Friday 30 October, evening.
const LAST: BalanceCheckIn = { id: "r1", at: new Date(2026, 9, 30, 20).toISOString(), amounts: { euro: 1000, cash: 100 } };
// Now: Tuesday 3 November, 18:00 — the new reading is saved a minute after the records.
const NOW = new Date(2026, 10, 3, 18);
const TODAY = "2026-11-03";

const tx = (id: string, amount: number, type: "expense" | "income", date: Date, over: Partial<Transaction> = {}): Transaction =>
  ({ id, userId: "u", amount, type, categoryId: "food", description: id, date, createdAt: date, updatedAt: date, accountId: "euro", ...over }) as Transaction;
// Logged since the reading: a 40 € supermarket on Sunday.
const logged = [tx("super", 40, "expense", new Date(2026, 10, 1, 12))];

const nikosDebt = computeDebtStatus(
  { id: "d1", userId: "u", person: "Νίκος", direction: "owed_to_me", amount: 100, date: new Date(2026, 8, 1), accountId: "euro", createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 8, 1) } as Debt,
  [],
  NOW,
);
const debts: DebtWithStatus[] = [nikosDebt];

let seq = 0;
const ctx = { accountId: "euro", today: TODAY, userId: "u", debts, accountName: (id: string) => accounts.find((a) => a.id === id)!.name, categoryName: () => "Φαγητό", newId: () => `n${++seq}`, now: NOW };

const rec = (r: Omit<GapRecord, "key">): GapRecord => ({ key: `k${++seq}`, ...r });

/** The reading and its records, played through the app's own counting. */
function play(typed: Record<string, number>, records: GapRecord[]) {
  const latest = readCheckIns([LAST], accounts, logged).at(-1)!;
  const before = expectedByAccount(accounts, latest, logged);
  const change = round2(typed.euro - before.euro);
  const rows = gapTransactionRows(gapWrites(records, ctx), "u", NOW);
  const all = [...logged, ...rows];
  const after = expectedByAccount(accounts, latest, all);
  // The reading is saved after the records were written.
  const reading: BalanceCheckIn = { id: "r2", at: new Date(NOW.getTime() + 60_000).toISOString(), amounts: typed };
  const readings = readCheckIns([LAST, reading], accounts, all);
  return { before, change, rows, all, after, readings };
}

describe("a difference of −73 €, three records of 68 €", () => {
  const records = () => [
    rec({ kind: "expense", amount: 8, date: TODAY, categoryId: "food", description: "καφές" }),
    rec({ kind: "expense", amount: 10, date: "2026-11-02", categoryId: "health" }),
    rec({ kind: "lent", amount: 50, date: "2026-11-01", person: "Νίκος" }),
  ];
  // Expected after Sunday's 40 €: 960. He reads 887.
  const typed = { euro: 887, cash: 100 };

  it("leaves 5 € unrecorded — by the sheet's sum and by the app's expectation alike", () => {
    const list = records();
    const { change, before, after, readings } = play(typed, list);
    expect(before.euro).toBe(960);
    expect(change).toBe(-73);
    // Route 1: the sheet's own counter.
    expect(gapRemaining(change, list, debts)).toBe(-5);
    // Route 2: the expectation the records move, against the figure read.
    expect(round2(typed.euro - after.euro)).toBe(-5);
    // Route 3: what the saved reading reports as unrecorded.
    expect(readings.at(-1)!.unlogged).toBe(-5);
    // And the three add up: records + remainder = difference.
    expect(round2(list.reduce((s, r) => s + gapEffect(r, debts), 0) + -5)).toBe(change);
    // Cash was not touched.
    expect(after.cash).toBe(100);
  });

  it("counts nothing on top of the new reading: today's record is marked, the others are earlier days", () => {
    const { rows, all, readings } = play(typed, records());
    const today = rows.filter((r) => r.description === "καφές");
    expect(today).toHaveLength(1);
    expect(today[0].inReading).toBe(true);
    expect(rows.filter((r) => r.description !== "καφές").every((r) => !r.inReading)).toBe(true);
    // The total right after the reading is the reading itself.
    expect(projectedTotal(readings.at(-1)!, all)).toBe(round2(typed.euro + typed.cash));
  });

  it("writes the loan as the debt form does: a debt with this card, and its money as a transfer", () => {
    const writes = gapWrites(records(), ctx);
    expect(writes.debts).toHaveLength(1);
    expect(writes.debts[0].data).toMatchObject({ person: "Νίκος", direction: "owed_to_me", amount: 50, accountId: "euro" });
    expect(writes.debts[0].data.inReading).toBeUndefined();
    expect(writes.debtCash).toHaveLength(1);
    expect(writes.debtCash[0]).toMatchObject({ type: "expense", amount: 50, accountId: "euro", debtId: writes.debts[0].id, debtPart: "loan" });
    // Not spending: a loan is money moved, not money spent.
    expect(isMoneyMove(gapTransactionRows(writes, "u", NOW).find((r) => r.debtId)!)).toBe(true);
  });

  it("the remainder does not depend on the order the records were listed in", () => {
    const list = records();
    expect(gapRemaining(-73, [...list].reverse(), debts)).toBe(gapRemaining(-73, list, debts));
    expect(play(typed, [...list].reverse()).readings.at(-1)!.unlogged).toBe(-5);
  });
});

describe("money that appeared: +120 €", () => {
  // Read 1080 against 960: 120 came in unrecorded.
  const typed = { euro: 1080, cash: 100 };
  it("a refund, Nikos paying 50 back, and 20 moved in from cash — 50 € still unrecorded", () => {
    const list = [
      rec({ kind: "income", amount: 30, date: TODAY, categoryId: "refunds", description: "επιστροφή" }),
      rec({ kind: "repaid", amount: 50, date: "2026-11-02", debtId: "d1" }),
      rec({ kind: "transferIn", amount: 20, date: TODAY, otherAccountId: "cash" }),
    ];
    const { change, after, readings, rows, all } = play(typed, list);
    expect(change).toBe(120);
    expect(gapRemaining(change, list, debts)).toBe(20);
    expect(round2(typed.euro - after.euro)).toBe(20);
    // The transfer took 20 out of the cash the app expects there.
    expect(after.cash).toBe(80);
    // The reading, which read 100 in cash, finds the 20 there too: the total gap is 20 + 20.
    expect(readings.at(-1)!.unlogged).toBe(40);
    // Both halves of the transfer carry the mark, being dated today; nothing doubles on the new reading.
    expect(rows.filter((r) => r.transferId).every((r) => r.inReading)).toBe(true);
    expect(projectedTotal(readings.at(-1)!, all)).toBe(1180);
  });

  it("a repayment is written as a repayment of that debt, with its money on this card", () => {
    const writes = gapWrites([rec({ kind: "repaid", amount: 50, date: "2026-11-02", debtId: "d1" })], ctx);
    expect(writes.payments).toHaveLength(1);
    expect(writes.payments[0].data).toMatchObject({ debtId: "d1", amount: 50, accountId: "euro" });
    expect(writes.debtCash).toEqual([expect.objectContaining({ type: "income", amount: 50, debtPaymentId: writes.payments[0].id, debtPart: "principal" })]);
  });
});

describe("going past the difference", () => {
  it("is allowed but flagged once the remainder points the other way", () => {
    expect(gapOverrun(-73, -5)).toBe(false);
    expect(gapOverrun(-73, 0)).toBe(false);
    expect(gapOverrun(-73, 7)).toBe(true);
    expect(gapOverrun(120, -1)).toBe(true);
    const list = [rec({ kind: "expense", amount: 80, date: TODAY, categoryId: "food" })];
    expect(gapRemaining(-73, list, debts)).toBe(7);
  });
});

describe("what a record may not be", () => {
  const base = { earliest: "2026-10-30", today: TODAY, accountId: "euro", debts, accounts };
  it("before the last reading's day, after today, or missing what its kind needs", () => {
    expect(gapRecordProblem({ kind: "expense", amount: 5, date: "2026-10-29", categoryId: "food" }, base)).toBe("accounts.gap.beforeReading");
    expect(gapRecordProblem({ kind: "expense", amount: 5, date: "2026-10-30", categoryId: "food" }, base)).toBeUndefined();
    expect(gapRecordProblem({ kind: "expense", amount: 5, date: "2026-11-04", categoryId: "food" }, base)).toBe("accounts.gap.noFuture");
    expect(gapRecordProblem({ kind: "expense", amount: 0, date: TODAY, categoryId: "food" }, base)).toBe("accounts.gap.needAmount");
    expect(gapRecordProblem({ kind: "expense", amount: 5, date: TODAY }, base)).toBe("accounts.gap.pickCategory");
    expect(gapRecordProblem({ kind: "lent", amount: 5, date: TODAY, person: " " }, base)).toBe("accounts.gap.needPerson");
    expect(gapRecordProblem({ kind: "repaid", amount: 5, date: TODAY, debtId: "nope" }, base)).toBe("accounts.gap.needDebt");
    expect(gapRecordProblem({ kind: "transferOut", amount: 5, date: TODAY, otherAccountId: "euro" }, base)).toBe("accounts.gap.needOtherAccount");
  });

  it("a record on the last reading's own day counts against that reading, without the mark", () => {
    const list = [rec({ kind: "expense", amount: 10, date: "2026-10-30", categoryId: "food" })];
    const { rows, after } = play({ euro: 950, cash: 100 }, list);
    expect(rows[0].inReading).toBeUndefined();
    // Written now, after Friday's reading: the app expects it to have left since.
    expect(after.euro).toBe(950);
  });
});

describe("two readings on the same day", () => {
  // 09:00 today: a reading that found nothing missing. 20:00: Eurobank reads 18 € short;
  // the 18 € coffee is written at 19:00, dated today.
  const MORNING: BalanceCheckIn = { id: "m", at: new Date(2026, 10, 3, 9).toISOString(), amounts: { euro: 960, cash: 100 } };
  const WRITTEN = new Date(2026, 10, 3, 19);
  const EVENING: BalanceCheckIn = { id: "e", at: new Date(2026, 10, 3, 20).toISOString(), amounts: { euro: 942, cash: 100 } };
  const coffee = () => [rec({ kind: "expense", amount: 18, date: TODAY, categoryId: "food" })];

  it("leaves today's record unmarked, so the time puts it between the two readings", () => {
    const writes = gapWrites(coffee(), { ...ctx, lastReadingDay: TODAY });
    expect(writes.transactions[0].data.inReading).toBeUndefined();
    // With a reading on an earlier day it is still marked.
    expect(gapWrites(coffee(), { ...ctx, lastReadingDay: "2026-10-30" }).transactions[0].data.inReading).toBe(true);
  });

  it("closes the evening's gap and leaves the morning's figure where it was", () => {
    const rows = gapTransactionRows(gapWrites(coffee(), { ...ctx, lastReadingDay: TODAY }), "u", WRITTEN);
    const morningOnly = readCheckIns([LAST, MORNING], accounts, logged);
    const latest = morningOnly.at(-1)!;
    // Route 1: the sheet's counter, from the difference against the morning's figure.
    const change = round2(EVENING.amounts.euro - expectedByAccount(accounts, latest, logged).euro);
    expect(change).toBe(-18);
    expect(gapRemaining(change, coffee(), debts)).toBe(0);
    // Route 2: the app's expectation once the record is among the transactions.
    expect(expectedByAccount(accounts, latest, [...logged, ...rows]).euro).toBe(942);
    // Route 3: both readings saved; the evening finds nothing unrecorded, and the
    // morning's own finding is what it was before the record existed.
    const both = readCheckIns([LAST, MORNING, EVENING], accounts, [...logged, ...rows]);
    expect(both.at(-1)!.unlogged).toBe(0);
    expect(both.at(-2)!.unlogged).toBe(morningOnly.at(-1)!.unlogged);
    // Nothing counted on top of the evening reading.
    expect(projectedTotal(both.at(-1)!, [...logged, ...rows])).toBe(1042);
  });

  it("would have broken with the mark: the morning reading takes it as already held", () => {
    const marked = gapTransactionRows(gapWrites(coffee(), { ...ctx, lastReadingDay: "2026-10-30" }), "u", WRITTEN);
    const both = readCheckIns([LAST, MORNING, EVENING], accounts, [...logged, ...marked]);
    expect(both.at(-1)!.unlogged).toBe(-18);
  });
});
