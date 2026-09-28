import { describe, expect, it } from "vitest";
import {
  anchorAt,
  balanceAnchors,
  daysSince,
  expectedByAccount,
  goalHeldAt,
  parseAmount,
  projectedTotal,
  readCheckIns,
  realDelta,
  recordsSinceByAccount,
  unloggedBetween,
  withoutAccount,
  type BalanceCheckIn,
  type MoneyAccount,
} from "./accountsUtils";
import { currentBalance, isAfterReading } from "../../shared/utils/balance";
import { netWorthSeries } from "../analytics/netWorthUtils";
import type { Transaction } from "../../shared/types/IndexTypes";

let n = 0;
/** An expense by default; `day` is September 2026, `created` the hour it was typed on `createdDay`. */
const tx = (amount: number, day: number, over: Partial<Transaction> & { createdDay?: number; hour?: number; month?: number } = {}): Transaction => {
  const { createdDay = day, hour = 12, month = 8, ...rest } = over;
  return {
    id: `t${n++}`,
    userId: "u",
    amount,
    type: "expense",
    categoryId: "c",
    description: "",
    date: new Date(2026, month, day),
    createdAt: new Date(2026, month, createdDay, hour),
    updatedAt: new Date(2026, month, createdDay, hour),
    ...rest,
  } as Transaction;
};

const accounts: MoneyAccount[] = [
  { id: "eb", name: "Eurobank", kind: "bank", main: true },
  { id: "rev", name: "Revolut", kind: "bank" },
  { id: "cash", name: "Μετρητά", kind: "cash" },
];

const reading = (id: string, iso: string, amounts: Record<string, number>): BalanceCheckIn => ({ id, at: new Date(iso).toISOString(), amounts });

// The figures on the mockup: read on the 21st, three expenses written, read again on the 28th.
const c1 = reading("c1", "2026-09-21T18:00:00", { eb: 1950, rev: 180, cash: 120 });
const c2 = reading("c2", "2026-09-28T19:00:00", { eb: 1842.3, rev: 214.5, cash: 25 });
const logged = [tx(62.4, 24), tx(45, 25), tx(13, 26)];

describe("isAfterReading", () => {
  const at = new Date("2026-09-28T19:00:00");

  it("puts later days after and earlier days before, whenever they were typed", () => {
    expect(isAfterReading(tx(1, 29), at)).toBe(true);
    // Backfilled on the 30th for the 23rd: the bank had it already.
    expect(isAfterReading(tx(1, 23, { createdDay: 30 }), at)).toBe(false);
  });

  it("decides the reading's own day by the time the record was written", () => {
    expect(isAfterReading(tx(1, 28, { hour: 12 }), at)).toBe(false);
    expect(isAfterReading(tx(1, 28, { hour: 20 }), at)).toBe(true);
  });

  it("treats a record the server has not stamped yet as new", () => {
    expect(isAfterReading(tx(1, 28, { createdAt: null as unknown as Date }), at)).toBe(true);
  });
});

describe("readCheckIns", () => {
  it("finds what went without a record between two readings", () => {
    const [first, second] = readCheckIns([c2, c1], accounts, logged);

    expect(first.checkIn.id).toBe("c1");
    expect(first.total).toBe(2250);
    expect(second.total).toBe(2081.8);
    // Second route, by hand: 2,250 − (62.40 + 45 + 13) = 2,129.60; 2,081.80 − 2,129.60.
    expect(second.expected).toBe(2129.6);
    expect(second.unlogged).toBe(-47.8);
  });

  it("shrinks the gap when the forgotten expense is written in later", () => {
    const backfilled = [...logged, tx(20, 23, { createdDay: 30 })];
    const [, second] = readCheckIns([c1, c2], accounts, backfilled);
    expect(second.unlogged).toBe(-27.8);
  });

  it("does not count a move into a savings goal as missing money", () => {
    const withGoal = [...logged, tx(300, 26, { type: "investment" as Transaction["type"], isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit" })];
    expect(readCheckIns([c1, c2], accounts, withGoal)[1].unlogged).toBe(-47.8);
  });

  it("does count money sent to an investment, which left the banks", () => {
    const invested = [...logged, tx(200, 26, { type: "investment" as Transaction["type"], isInvestmentTransaction: true, contributionType: "deposit" })];
    // It was recorded, so it is expected, and the real total is 200 short of the
    // old one for it: nothing is left unexplained that was not before.
    const c2Invested = reading("c2", "2026-09-28T19:00:00", { eb: 1642.3, rev: 214.5, cash: 25 });
    expect(readCheckIns([c1, c2Invested], accounts, invested)[1].unlogged).toBe(-47.8);
  });

  it("lets a newly listed account join without a difference", () => {
    const withPiraeus = [...accounts, { id: "pir", name: "Πειραιώς", kind: "bank" as const }];
    const c2Plus = reading("c2", "2026-09-28T19:00:00", { ...c2.amounts, pir: 500 });
    const [, second] = readCheckIns([c1, c2Plus], withPiraeus, logged);
    expect(second.added).toEqual(["pir"]);
    expect(second.total).toBe(2581.8);
    expect(second.unlogged).toBe(-47.8);
  });

  it("does not see a move between two of your own accounts", () => {
    // A €100 cash machine withdrawal, never written down.
    const c2b = reading("c2", "2026-09-28T19:00:00", { eb: 1950 - 120.4 - 100, rev: 180, cash: 220 });
    expect(readCheckIns([c1, c2b], accounts, logged)[1].unlogged).toBe(0);
  });

  it("tells the first reading what the app had been saying", () => {
    const legacy = { amount: 2000, date: new Date(2026, 8, 1) };
    const before = [tx(1500, 5, { type: "income" }), tx(1000, 10)];
    const [first] = readCheckIns([c1], accounts, before, legacy);
    // 2,000 + 1,500 − 1,000 = 2,500 said; 2,250 read.
    expect(first.appSaid).toBe(2500);
    expect(first.unlogged).toBeUndefined();
  });
});

describe("the balance counted from a reading", () => {
  const goal = tx(300, 20, { type: "investment" as Transaction["type"], isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit" });
  const later = [tx(30, 29), tx(1700, 30, { type: "income" }), tx(12, 28, { hour: 21 })];
  const all = [...logged, goal, ...later];

  it("is the reading less what sits in goals, plus what came after", () => {
    const readings = readCheckIns([c1, c2], accounts, all);
    const anchors = balanceAnchors(readings, all);
    const balance = currentBalance(all, anchors.at(-1));

    // 2,081.80 read − 300 in the goal − 30 − 12 + 1,700.
    expect(balance).toBeCloseTo(3439.8, 2);
    // Second route: the projected real total less everything held in goals now.
    expect(balance).toBeCloseTo(projectedTotal(readings[1], all) - goalHeldAt(all, new Date(2027, 0, 1)), 2);
  });

  it("agrees with the projection for any mix of records", () => {
    const rng = (() => {
      let s = 7;
      return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    })();
    for (let round = 0; round < 25; round++) {
      const rows: Transaction[] = [];
      for (let i = 0; i < 30; i++) {
        const day = 15 + Math.floor(rng() * 16);
        const kind = rng();
        const amount = Math.round(rng() * 50000) / 100;
        rows.push(
          kind < 0.6
            ? tx(amount, day, { hour: Math.floor(rng() * 24) })
            : kind < 0.75
              ? tx(amount, day, { type: "income" })
              : kind < 0.9
                ? tx(amount, day, { type: "investment" as Transaction["type"], isInvestmentTransaction: true, isGoalTransaction: true, contributionType: rng() < 0.7 ? "deposit" : "withdrawal" })
                : tx(amount, day, { type: "investment" as Transaction["type"], isInvestmentTransaction: true, contributionType: "deposit" }),
        );
      }
      const readings = readCheckIns([c1, c2], accounts, rows);
      const balance = currentBalance(rows, balanceAnchors(readings, rows).at(-1));
      expect(balance).toBeCloseTo(projectedTotal(readings[1], rows) - goalHeldAt(rows, new Date(2027, 0, 1)), 2);
    }
  });

  it("keeps the Settings figure only for the time before the first reading", () => {
    const legacy = { amount: 2000, date: new Date(2026, 7, 1) };
    const readings = readCheckIns([c1, c2], accounts, all, legacy);
    const anchors = balanceAnchors(readings, all, legacy);
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toBe(legacy);
    expect(anchorAt(anchors, new Date(2026, 8, 10))).toBe(legacy);
    expect(anchorAt(anchors, new Date(2026, 8, 25))?.at?.toISOString()).toBe(c1.at);

    // A Settings date after the first reading is older news than the readings.
    expect(balanceAnchors(readings, all, { amount: 5, date: new Date(2026, 8, 25) })).toHaveLength(2);
  });

  it("draws each month of the position from the reading in force when it closes", () => {
    const legacy = { amount: 2000, date: new Date(2026, 7, 1) };
    const august = [tx(500, 10, { month: 7 })];
    const rows = [...august, ...all];
    const readings = readCheckIns([c1, c2], accounts, rows, legacy);
    const points = netWorthSeries(rows, [], balanceAnchors(readings, rows, legacy), new Date(2026, 7, 1), new Date(2026, 8, 30));

    expect(points.map((p) => p.key)).toEqual(["2026-08", "2026-09"]);
    // August from the Settings figure: 2,000 − 500.
    expect(points[0].cash).toBe(1500);
    // September from the reading on the 28th, and the same as the balance card.
    expect(points[1].cash).toBeCloseTo(currentBalance(rows, balanceAnchors(readings, rows, legacy).at(-1)), 2);
  });
});

describe("expectedByAccount", () => {
  it("puts the records since the reading on the main account and adds up to the projection", () => {
    const readings = readCheckIns([c1], accounts, logged);
    const expected = expectedByAccount(accounts, readings[0], logged);
    expect(expected).toEqual({ eb: 1829.6, rev: 180, cash: 120 });
    expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBeCloseTo(projectedTotal(readings[0], logged), 2);
  });
});

describe("records that name their account", () => {
  const readings = readCheckIns([c1], accounts, []);
  const rows = [
    tx(62.4, 24), // names none: the main account
    tx(45, 25, { accountId: "rev" }),
    tx(13, 26, { accountId: "cash" }),
    tx(20, 27, { accountId: "gone" }), // an account since deleted: back to the main one
    tx(100, 27, { type: "income", accountId: "rev" }),
  ];

  it("comes off the account it names, and the rest off the main one", () => {
    const expected = expectedByAccount(accounts, readings[0], rows);
    // Eurobank 1,950 − 62.40 − 20; Revolut 180 − 45 + 100; cash 120 − 13.
    expect(expected).toEqual({ eb: 1867.6, rev: 235, cash: 107 });
  });

  it("still adds up to the projected total, however the records are spread", () => {
    const expected = expectedByAccount(accounts, readings[0], rows);
    const sum = Object.values(expected).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(projectedTotal(readings[0], rows), 2);
    // Second route: 2,250 − 62.40 − 45 − 13 − 20 + 100.
    expect(sum).toBeCloseTo(2209.6, 2);
  });

  it("counts each account's records since the reading", () => {
    expect(recordsSinceByAccount(accounts, readings[0], rows)).toEqual({ eb: 2, rev: 2, cash: 1 });
  });
});

describe("unloggedBetween", () => {
  it("adds the gaps found by readings inside the stretch", () => {
    const c3 = reading("c3", "2026-10-05T10:00:00", { eb: 1800, rev: 214.5, cash: 25 });
    const readings = readCheckIns([c1, c2, c3], accounts, logged);
    // c2 found −47.80; c3 found 1,800 − 1,842.30 = −42.30 with nothing written.
    expect(unloggedBetween(readings, new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59))).toBe(-47.8);
    expect(unloggedBetween(readings, new Date(2026, 9, 1), new Date(2026, 9, 31))).toBe(-42.3);
    expect(unloggedBetween(readings, new Date(2026, 8, 1), new Date(2026, 9, 31))).toBe(-90.1);
  });
});

describe("withoutAccount", () => {
  it("takes the account out of every reading and drops readings left empty", () => {
    const onlyCash = reading("c0", "2026-09-01T10:00:00", { cash: 10 });
    const left = withoutAccount([onlyCash, c1], "cash");
    expect(left.map((c) => c.id)).toEqual(["c1"]);
    expect(left[0].amounts).toEqual({ eb: 1950, rev: 180 });
  });
});

describe("daysSince", () => {
  it("counts whole days, and nothing without a reading", () => {
    const [first] = readCheckIns([c1], accounts, []);
    expect(daysSince(first, new Date("2026-09-30T17:00:00"))).toBe(8);
    expect(daysSince(undefined)).toBeUndefined();
  });
});

describe("realDelta", () => {
  it("leaves a goal move out and keeps an investment in", () => {
    expect(realDelta(tx(100, 1, { isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit" }))).toBe(0);
    expect(realDelta(tx(100, 1, { isInvestmentTransaction: true, contributionType: "deposit" }))).toBe(-100);
    expect(realDelta(tx(100, 1, { type: "income" }))).toBe(100);
  });
});

describe("parseAmount", () => {
  it("reads the ways a Greek keyboard writes money", () => {
    expect(parseAmount("1.842,30")).toBe(1842.3);
    expect(parseAmount("1842,30")).toBe(1842.3);
    expect(parseAmount("1842.30")).toBe(1842.3);
    expect(parseAmount("1.842")).toBe(1842);
    expect(parseAmount("1,842.30")).toBe(1842.3);
    expect(parseAmount("25")).toBe(25);
    expect(parseAmount("-120,5")).toBe(-120.5);
    expect(parseAmount(" 214,50 € ")).toBe(214.5);
  });

  it("refuses what is not a number", () => {
    expect(parseAmount("")).toBeUndefined();
    expect(parseAmount("abc")).toBeUndefined();
    expect(parseAmount("12,3,4")).toBeUndefined();
  });
});
