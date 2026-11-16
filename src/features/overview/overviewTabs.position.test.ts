import { describe, expect, it } from "vitest";
import { positionParts } from "./overviewTabs";
import { netWorthSeries } from "../analytics/netWorthUtils";
import { balanceAnchors, expectedByAccount, goalHeldTotal, projectedTotal, readCheckIns, type BalanceCheckIn, type MoneyAccount } from "../accounts/accountsUtils";
import { currentBalance } from "../../shared/utils/balance";
import { computeDebtStatus } from "../debts/debtsUtils";
import type { Debt, DebtPayment, DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// «Περιουσία» → «Από τι αποτελείται».
//
// The owner has money on his cards and the tab did not show it: its one money
// line was «Μετρητά», the spendable figure (banks less goals), under the word
// the Banks page uses for the wallet. Now the lines are the Banks page's own —
// «Τράπεζες & μετρητά» and «Από αυτά, στους στόχους» — and the net under them
// is the one the tab always had (the owner's call, 20 Oct 2026):
//
//     net = banks − goals in banks + owed to me − owed by me
//
// Investments and goal money handed to someone are beside the net, not in it.
// Every figure is worked out by hand below, and the cards' total is checked
// against each card as the Banks page has it.

const NOW = new Date(2026, 8, 30, 12); // 30 September 2026, noon
const FROM = new Date(2026, 3, 1);

let n = 0;
/** An expense by default, typed at noon on its own day unless `created` says otherwise. */
const tx = (amount: number, day: Date, over: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${n++}`, userId: "u", amount, type: "expense", categoryId: "c", description: "", date: day, createdAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12), updatedAt: day, ...over }) as Transaction;
const sep = (d: number) => new Date(2026, 8, d);
const reading = (iso: string, amounts: Record<string, number>): BalanceCheckIn => ({ id: iso, at: new Date(iso).toISOString(), amounts });
const debt = (id: string, direction: Debt["direction"], amount: number, payments: DebtPayment[] = []): DebtWithStatus =>
  computeDebtStatus({ id, userId: "u", person: "Nikos", direction, amount, date: sep(1), createdAt: sep(1), updatedAt: sep(1) } as Debt, payments, NOW);

/** Everything the Overview page works out, in the order it does. */
function overview(accounts: MoneyAccount[], checkIns: BalanceCheckIn[], transactions: Transaction[], debts: DebtWithStatus[] = []) {
  const readings = readCheckIns(checkIns, accounts, transactions);
  const anchors = balanceAnchors(readings, transactions);
  const latest = readings.at(-1);
  const banksNow = latest ? projectedTotal(latest, transactions) : undefined;
  const inGoals = goalHeldTotal(transactions);
  const series = netWorthSeries(transactions, debts, anchors, FROM, NOW);
  const point = series.at(-1)!;
  return {
    parts: positionParts(point, banksNow, inGoals),
    point,
    // The Banks page: each card, and the money card's «Λεφτά που έχεις».
    cards: expectedByAccount(accounts, latest, transactions),
    balance: currentBalance(transactions, anchors.at(-1)),
  };
}

const add = (...values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

const accounts: MoneyAccount[] = [
  { id: "eb", name: "Eurobank", kind: "bank", main: true },
  { id: "rev", name: "Revolut", kind: "bank" },
  { id: "cash", name: "Μετρητά", kind: "cash" },
];

describe("positionParts — what the net position is made of", () => {
  // Read on the 21st: 1950 + 180 + 120 = 2250, of which 400 already in a goal.
  const checkIn = reading("2026-09-21T18:00:00", { eb: 1950, rev: 180, cash: 120 });
  const transactions = [
    tx(400, sep(10), { isGoalTransaction: true, goalId: "g1", contributionType: "deposit" }),
    tx(62.4, sep(24)),
    tx(45, sep(25), { accountId: "rev" }),
    tx(300, sep(26), { type: "income" }),
    // Into a goal: still on the card.
    tx(100, sep(27), { isGoalTransaction: true, goalId: "g1", contributionType: "deposit" }),
    // To the broker: gone from the cards.
    tx(200, sep(28), { isInvestmentTransaction: true, goalId: "inv", contributionType: "deposit" }),
    // Goal money handed to Nikos to keep: gone from the cards, still the goal's.
    tx(50, sep(28), { isGoalTransaction: true, goalId: "g2", contributionType: "deposit", heldBy: "Nikos" }),
    // Typed in on the 29th for the 2nd of October: the money card counts it now.
    tx(30, new Date(2026, 9, 2), { createdAt: new Date(2026, 8, 29, 9) }),
  ];
  const debts = [debt("lent", "owed_to_me", 300), debt("loan", "owed_by_me", 1000, [{ id: "p1", userId: "u", debtId: "loan", amount: 250, date: sep(15), createdAt: sep(15) } as DebtPayment])];
  const { parts, point, cards, balance } = overview(accounts, [checkIn], transactions, debts);

  it("shows the money on the cards — the Banks page's total, card by card", () => {
    // By hand: 2250 − 62.40 − 45 + 300 (goal deposit stays) − 200 − 50 − 30 = 2162.60.
    expect(parts.banks).toBe(2162.6);
    // Card by card, as the Banks page lists them:
    //   Eurobank (main, everything that names no card) 1950 − 62.40 + 300 − 200 − 50 − 30 = 1907.60
    //   Revolut 180 − 45 = 135 · cash untouched 120.
    expect(cards).toEqual({ eb: 1907.6, rev: 135, cash: 120 });
    expect(add(...Object.values(cards))).toBe(parts.banks);
  });

  it("takes the goals' share of the cards off once, and lands on the money card's figure", () => {
    // 400 + 100 in the goal; the 50 Nikos keeps is not on any card.
    expect(parts.goalsInBanks).toBe(500);
    // 2162.60 − 500 = 1662.60 — and the other way, from the reading: 2250 − 400
    // = 1850 to spend, then −62.40 −45 +300 −100 −200 −50 −30 = 1662.60.
    expect(parts.available).toBe(1662.6);
    expect(add(parts.banks!, -parts.goalsInBanks!)).toBe(parts.available);
    expect(balance).toBe(1662.6);
  });

  it("adds up, line by line, to the headline", () => {
    // 2162.60 − 500 + 300 − (1000 − 250) = 1212.60
    expect(parts.owedToMe).toBe(300);
    expect(parts.owedByMe).toBe(750);
    expect(parts.net).toBe(1212.6);
    expect(add(parts.banks!, -parts.goalsInBanks!, parts.owedToMe, -parts.owedByMe)).toBe(parts.net);
    expect(point.net).toBe(parts.net);
  });

  it("names beside the net what left the cards without being spent", () => {
    // Nikos's 50 for g2, and the 200 at the broker. g1's 500 is in the lines above, not here again.
    expect(parts.goalsOutside).toBe(50);
    expect(parts.investments).toBe(200);
    // Everything the goals hold = in the banks + outside: 500 + 50.
    expect(add(parts.goalsInBanks!, parts.goalsOutside)).toBe(point.inGoals);
  });

  it("counts a record dated after the month's end, as the money card does", () => {
    // Without the 30 for 2 October the position would sit 30 above the card.
    const withoutFuture = overview(accounts, [checkIn], transactions.slice(0, -1), debts);
    expect(add(withoutFuture.parts.available, -parts.available)).toBe(30);
    expect(add(withoutFuture.parts.banks!, -parts.banks!)).toBe(30);
  });
});

describe("positionParts — the edges", () => {
  it("before the first reading: no bank figures, the records' sum, every goal beside the net", () => {
    const transactions = [tx(1000, sep(1), { type: "income" }), tx(120, sep(5)), tx(300, sep(6), { isGoalTransaction: true, goalId: "g", contributionType: "deposit" })];
    const { parts, balance } = overview(accounts, [], transactions);
    expect(parts.banks).toBeUndefined();
    expect(parts.goalsInBanks).toBeUndefined();
    // 1000 − 120 − 300 = 580, the money card's own figure.
    expect(parts.available).toBe(580);
    expect(balance).toBe(580);
    expect(parts.goalsOutside).toBe(300);
    expect(parts.net).toBe(580);
  });

  it("one card only", () => {
    const one: MoneyAccount[] = [{ id: "eb", name: "Eurobank", kind: "bank", main: true }];
    const { parts, cards } = overview(one, [reading("2026-09-20T10:00:00", { eb: 840.55 })], [tx(40.55, sep(22))]);
    // 840.55 − 40.55 = 800
    expect(parts.banks).toBe(800);
    expect(cards).toEqual({ eb: 800 });
    expect(parts.goalsInBanks).toBe(0);
    expect(parts.available).toBe(800);
    expect(parts.net).toBe(800);
  });

  it("cash only", () => {
    const wallet: MoneyAccount[] = [{ id: "cash", name: "Μετρητά", kind: "cash", main: true }];
    const { parts, cards } = overview(wallet, [reading("2026-09-20T10:00:00", { cash: 75 })], [tx(12.3, sep(21)), tx(20, sep(23), { type: "income" })]);
    // 75 − 12.30 + 20 = 82.70
    expect(parts.banks).toBe(82.7);
    expect(cards).toEqual({ cash: 82.7 });
    expect(parts.net).toBe(82.7);
  });

  it("a card in overdraft counts against the total", () => {
    const { parts, cards } = overview(accounts, [reading("2026-09-20T10:00:00", { eb: -120.4, rev: 500, cash: 0 })], [tx(80, sep(22))]);
    // Eurobank −120.40 − 80 = −200.40; Revolut 500; cash 0 → 299.60.
    expect(cards).toEqual({ eb: -200.4, rev: 500, cash: 0 });
    expect(parts.banks).toBe(299.6);
    expect(parts.net).toBe(299.6);
  });

  it("a goal fed from a card in overdraft still comes off once", () => {
    const transactions = [tx(150, sep(22), { isGoalTransaction: true, goalId: "g", contributionType: "deposit" })];
    const { parts } = overview(accounts, [reading("2026-09-20T10:00:00", { eb: -50, rev: 100, cash: 0 })], transactions);
    // The banks still hold 50 (−50 + 100); 150 of it is the goal's → −100 to spend.
    expect(parts.banks).toBe(50);
    expect(parts.goalsInBanks).toBe(150);
    expect(parts.available).toBe(-100);
    expect(parts.goalsOutside).toBe(0);
    expect(parts.net).toBe(-100);
  });
});
