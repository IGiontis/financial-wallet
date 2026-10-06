import { describe, it, expect } from "vitest";
import type { Transaction } from "../../shared/types/IndexTypes";
import { adjustCheckInsForEdit, expectedByAccount, readCheckIns, type BalanceCheckIn, type MoneyAccount } from "./accountsUtils";

// An edited record, as the owner reads it: "I said 100 from Revolut, it was 80"
// gives Revolut 20 back; "it was 140" takes 40 more — even when a bank reading
// was taken after the record and already counted the 100.

const accounts: MoneyAccount[] = [
  { id: "revolut", name: "Revolut", kind: "bank" },
  { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
];
const READ = "2026-10-05T17:00:00.000Z";
const reading = (amounts: Record<string, number>, at = READ): BalanceCheckIn => ({ id: `r-${at}`, at, amounts });
const spent = (over: Partial<Transaction> = {}) =>
  ({ id: "t1", userId: "u", type: "expense", amount: 100, categoryId: "c", description: "Shop", date: new Date(2026, 9, 4), createdAt: new Date(2026, 9, 4, 10), updatedAt: new Date(2026, 9, 4, 10), accountId: "revolut", ...over }) as Transaction;

/** What each card shows with these readings and this one record. */
const holds = (checkIns: BalanceCheckIn[], record: Transaction) => {
  const readings = readCheckIns(checkIns, accounts, [record], undefined);
  return expectedByAccount(accounts, readings.at(-1), [record]);
};

describe("an edit of a record the last reading already counted", () => {
  const before = [reading({ revolut: 1000, eurobank: 2000 })];

  it("100 made 80 gives Revolut its 20 back", () => {
    const original = spent();
    const after = adjustCheckInsForEdit(before, accounts, original, spent({ amount: 80 }));
    expect(after[0].amounts).toEqual({ revolut: 1020, eurobank: 2000 });
    // The card, read the second way: 1.000 + 20.
    expect(holds(after, spent({ amount: 80 })).revolut).toBe(1020);
  });

  it("100 made 140 takes 40 more", () => {
    const after = adjustCheckInsForEdit(before, accounts, spent(), spent({ amount: 140 }));
    expect(after[0].amounts.revolut).toBe(960);
  });

  it("moved to Eurobank: Revolut gets the 100 back, Eurobank pays it", () => {
    const after = adjustCheckInsForEdit(before, accounts, spent(), spent({ accountId: "eurobank" }));
    expect(after[0].amounts).toEqual({ revolut: 1100, eurobank: 1900 });
  });

  it("moved to after the reading: the reading gives it back, and it counts as a record since", () => {
    const changed = spent({ date: new Date(2026, 9, 7), createdAt: new Date(2026, 9, 4, 10) });
    const after = adjustCheckInsForEdit(before, accounts, spent(), changed);
    expect(after[0].amounts.revolut).toBe(1100);
    expect(holds(after, changed).revolut).toBe(1000);
  });

  it("an income: 100 made 120 puts 20 more in", () => {
    const original = spent({ type: "income" });
    const after = adjustCheckInsForEdit(before, accounts, original, spent({ type: "income", amount: 120 }));
    expect(after[0].amounts.revolut).toBe(1020);
  });

  it("corrects every reading that counted it, and none from before it", () => {
    const earlier = reading({ revolut: 1100, eurobank: 2000 }, "2026-10-03T17:00:00.000Z");
    const later = reading({ revolut: 900, eurobank: 2000 }, "2026-10-06T17:00:00.000Z");
    const after = adjustCheckInsForEdit([earlier, before[0], later], accounts, spent(), spent({ amount: 80 }));
    expect(after.map((c) => c.amounts.revolut)).toEqual([1100, 1020, 920]);
  });
});

describe("an edit the readings never counted", () => {
  it("changes no reading — the record since the reading moves the card by itself", () => {
    const checkIns = [reading({ revolut: 1000, eurobank: 2000 })];
    const original = spent({ date: new Date(2026, 9, 6), createdAt: new Date(2026, 9, 6, 10) });
    const changed = { ...original, amount: 80 };
    expect(adjustCheckInsForEdit(checkIns, accounts, original, changed)).toBe(checkIns);
    // 1.000 − 100 = 900 before; 1.000 − 80 = 920 after: the same +20.
    expect(holds(checkIns, original).revolut).toBe(900);
    expect(holds(checkIns, changed).revolut).toBe(920);
  });

  it("leaves alone an account the reading never held", () => {
    const checkIns = [reading({ eurobank: 2000 })];
    expect(adjustCheckInsForEdit(checkIns, accounts, spent(), spent({ amount: 80 }))).toBe(checkIns);
  });
});
