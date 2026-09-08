import { describe, it, expect } from "vitest";
import { allocate, assignRemainder, bucketActual, bucketCeiling, committedMonthly, debtMonthlyShare, emergencyTarget, extraFor, extraPayForMonth, monthKey, nextRollover, seedFromHistory, setBucketAmount, spentByCategory, type Bucket } from "./allocationUtils";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import type { BillWithStatus, Category, DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

const now = new Date(2026, 8, 5);

const bill = (monthlyEquivalent: number, isActive = true): BillWithStatus => ({ isActive, monthlyEquivalent }) as BillWithStatus;

const goal = (monthlyRequired: number): InvestmentGoalWithStats => ({ goalType: "target", targetPeriod: "monthly", monthlyRequired }) as unknown as InvestmentGoalWithStats;

const debt = (remaining: number, over: Partial<DebtWithStatus> = {}): DebtWithStatus =>
  ({ direction: "owed_by_me", isSettled: false, remaining, ...over }) as DebtWithStatus;

const line = (id: string, amount: number, kind: BudgetLine["kind"] = "expense"): BudgetLine => ({ id, label: id, amount, kind });

const noCommitment = { bills: 0, goals: 0, debts: 0, total: 0 };

describe("committedMonthly", () => {
  it("adds up bills, goals and what you owe", () => {
    const c = committedMonthly([bill(300), bill(220)], [goal(150)], [debt(80)], now);
    expect(c).toEqual({ bills: 520, goals: 150, debts: 80, total: 750 });
  });

  it("ignores a paused bill", () => {
    expect(committedMonthly([bill(300), bill(999, false)], [], [], now).bills).toBe(300);
  });

  it("leaves out money owed to you", () => {
    // It is not income until it arrives — the same rule the debts page states.
    const c = committedMonthly([], [], [debt(500, { direction: "owed_to_me" }), debt(80)], now);
    expect(c.debts).toBe(80);
  });

  it("leaves out a settled debt", () => {
    expect(committedMonthly([], [], [debt(200, { isSettled: true })], now).debts).toBe(0);
  });
});

describe("allocate", () => {
  it("divides what is left, not the salary", () => {
    const a = allocate(1800, { bills: 520, goals: 150, debts: 80, total: 750 }, [line("food", 420)]);

    expect(a.free).toBe(1050);
    expect(a.allocated).toBe(420);
    expect(a.unallocated).toBe(630);
    // 40% of the free money, not 23% of the salary — the figure people mean.
    expect(a.buckets[0].share).toBeCloseTo(0.4, 5);
  });

  it("counts an income line as money arriving, not as a bucket", () => {
    const a = allocate(1800, noCommitment, [line("food", 400), line("room", 150, "income")]);

    expect(a.income).toBe(1950);
    expect(a.free).toBe(1950);
    expect(a.buckets.map((b) => b.id)).toEqual(["food"]);
  });

  it("reports a negative pot when the commitments alone overrun the pay", () => {
    // Saying "you have €0 to divide" would be a lie that hides the size of it.
    const a = allocate(800, { bills: 900, goals: 0, debts: 0, total: 900 }, []);
    expect(a.free).toBe(-100);
  });

  it("still draws a bucket that has no pot behind it", () => {
    // This used to expect a share of 0, on the reading that an empty pot means
    // no shares. That drew an empty bar with a €100 bucket listed under it,
    // which looks like the bucket was ignored. It is the whole of what has
    // been allocated, so it is the whole bar — and `unallocated` carries the
    // actual complaint.
    const a = allocate(0, noCommitment, [line("food", 100)]);

    expect(a.buckets[0].share).toBe(1);
    expect(a.unallocated).toBe(-100);
  });

  it("gives no share when there is neither a pot nor a bucket", () => {
    expect(allocate(0, noCommitment, [line("food", 0)]).buckets[0].share).toBe(0);
  });

  it("spreads a bucket across an average month", () => {
    expect(allocate(1000, noCommitment, [line("food", 420)]).buckets[0].perDay).toBeCloseTo(13.8, 1);
  });
});

describe("setBucketAmount", () => {
  const free = 1000;
  const lines = [line("food", 400), line("life", 300), line("shopping", 100)];

  it("sets only the bucket that moved", () => {
    // The others used to be rewritten in proportion. It kept the total on the
    // pot and it meant the leftover never moved off zero, which is the figure
    // the reader is watching while they do this.
    const next = setBucketAmount(lines, "food", 500, free);

    expect(next.find((l) => l.id === "food")!.amount).toBe(500);
    expect(next.find((l) => l.id === "life")!.amount).toBe(300);
    expect(next.find((l) => l.id === "shopping")!.amount).toBe(100);
  });

  it("lets the leftover shrink as buckets fill", () => {
    const after = allocate(1000, noCommitment, setBucketAmount(lines, "food", 500, free));
    expect(after.unallocated).toBe(100);
  });

  it("refuses to allocate the same euro twice", () => {
    // 300 + 100 are already spoken for, so food can reach 600 and no further.
    const next = setBucketAmount(lines, "food", 900, free);
    expect(next.find((l) => l.id === "food")!.amount).toBe(600);
  });

  it("keeps the total within the pot for every bucket and every figure", () => {
    for (const id of ["food", "life", "shopping"]) {
      for (const amount of [0, 125, 333.33, 900, 5000]) {
        const total = setBucketAmount(lines, id, amount, free).reduce((sum, l) => sum + l.amount, 0);
        expect(Math.round(total * 100) / 100).toBeLessThanOrEqual(free);
      }
    }
  });

  it("will not take a bucket below zero", () => {
    expect(setBucketAmount(lines, "food", -200, free).find((l) => l.id === "food")!.amount).toBe(0);
  });

  it("gives a bucket no room when the others already hold the pot", () => {
    const full = [line("food", 0), line("life", 1000)];
    expect(setBucketAmount(full, "food", 500, free).find((l) => l.id === "food")!.amount).toBe(0);
  });

  it("ignores an id that is not a bucket", () => {
    const withIncome = [...lines, line("room", 150, "income")];
    expect(setBucketAmount(withIncome, "room", 999, free)).toEqual(withIncome);
    expect(setBucketAmount(lines, "nope", 100, free)).toEqual(lines);
  });
});

describe("bucketCeiling", () => {
  it("is the pot less whatever the others hold", () => {
    expect(bucketCeiling([line("food", 400), line("life", 300)], "food", 1000)).toBe(700);
  });

  it("never goes negative when the pot is already overspent", () => {
    expect(bucketCeiling([line("food", 0), line("life", 1500)], "food", 1000)).toBe(0);
  });
});

describe("extraFor", () => {
  const now = new Date(2026, 8, 5);

  it("stamps the month it belongs to", () => {
    expect(monthKey(now)).toBe("2026-09");
  });

  it("counts while its month is the current one", () => {
    expect(extraFor({ month: "2026-09", label: "Έξτρα αποταμίευση", amount: 200 }, now)).toBe(200);
  });

  it("expires rather than shrinking the pot for ever", () => {
    // The whole point of "this month" is that it stops being true next month.
    expect(extraFor({ month: "2026-08", label: "x", amount: 200 }, now)).toBe(0);
  });

  it("ignores nothing, and rubbish", () => {
    expect(extraFor(null, now)).toBe(0);
    expect(extraFor({ month: "2026-09", label: "x", amount: NaN }, now)).toBe(0);
    expect(extraFor({ month: "2026-09", label: "x", amount: -50 }, now)).toBe(0);
  });
});

describe("allocate with a one-off", () => {
  it("takes it off the top, like a bill", () => {
    const a = allocate(1800, { bills: 520, goals: 150, debts: 80, total: 750 }, [line("food", 420)], 200);

    expect(a.extra).toBe(200);
    expect(a.free).toBe(850);
    expect(a.unallocated).toBe(430);
  });

  it("turns the leftover negative when the plan no longer fits, rather than hiding it", () => {
    // This is the useful answer: it names exactly how much has to give.
    // 1800 − 750 committed − 300 one-off = 750 free, against a 1000 bucket.
    const a = allocate(1800, { bills: 520, goals: 150, debts: 80, total: 750 }, [line("food", 1000)], 300);
    expect(a.free).toBe(750);
    expect(a.unallocated).toBe(-250);
  });
});

describe("assignRemainder", () => {
  it("hands the leftover to one bucket so the pot reaches zero", () => {
    const next = assignRemainder([line("food", 400), line("life", 200)], "food", 100);
    expect(next.find((l) => l.id === "food")!.amount).toBe(500);
  });

  it("takes an overspend back off the same way", () => {
    const next = assignRemainder([line("food", 400)], "food", -50);
    expect(next[0].amount).toBe(350);
  });

  it("never drives a bucket negative", () => {
    expect(assignRemainder([line("food", 30)], "food", -100)[0].amount).toBe(0);
  });

  it("does nothing when the pot is already spoken for", () => {
    const lines = [line("food", 400)];
    expect(assignRemainder(lines, "food", 0)).toEqual(lines);
  });
});

describe("debtMonthlyShare", () => {
  it("spreads a dated debt over the months until it is due", () => {
    // The bug this replaced: the whole balance came out of *this* month, so a
    // loan due next June made a solvent September look nearly broke.
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 10, 1) }), now)).toBe(200);
  });

  it("asks for all of it in the month it is due", () => {
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 8, 30) }), now)).toBe(600);
  });

  it("asks for all of it once the date has gone", () => {
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 5, 1) }), now)).toBe(600);
  });

  it("treats a debt with no agreed date as owed now", () => {
    // There is nothing to spread it across, and "some day" is not a plan.
    expect(debtMonthlyShare(debt(600), now)).toBe(600);
  });

  it("is what committedMonthly counts, rather than the whole balance", () => {
    const far = debt(655, { dueDate: new Date(2027, 5, 1) });
    expect(committedMonthly([], [], [far], now).debts).toBe(debtMonthlyShare(far, now));
    expect(committedMonthly([], [], [far], now).debts).toBeLessThan(655);
  });
});

describe("shares stay a fraction of the bar", () => {
  const shrunk = { bills: 0, goals: 0, debts: 0, total: 900 };

  it("never sums past 100%, even when the pot shrank under the buckets", () => {
    // 1,000 income against 900 of commitments leaves 100, but the buckets were
    // set when there was 300 to divide. Against `free` these read 89% / 24% /
    // 48% and the slices ran off the end of the bar.
    const lines = [line("a", 150), line("b", 90), line("c", 60)];
    const plan = allocate(1000, shrunk, lines);

    const total = plan.buckets.reduce((sum, b) => sum + b.share, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(plan.buckets.every((b) => b.share <= 1)).toBe(true);
  });

  it("still reports the overspend, which is where the reader should hear about it", () => {
    const plan = allocate(1000, shrunk, [line("a", 150), line("b", 90), line("c", 60)]);

    expect(plan.free).toBe(100);
    expect(plan.allocated).toBe(300);
    expect(plan.unallocated).toBe(-200);
  });

  it("keeps shares against the pot while there is room to spare", () => {
    const plan = allocate(1000, noCommitment, [line("a", 250), line("b", 250)]);

    expect(plan.buckets.map((b) => b.share)).toEqual([0.25, 0.25]);
    expect(plan.unallocated).toBe(500);
  });
});

// ─── Buckets measured against what actually happened ────────────────────────

const tx = (categoryId: string, amount: number, day: number, month = 8, over: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${Math.random()}`, userId: "u1", amount, type: "expense", categoryId, date: new Date(2026, month, day), description: "x", createdAt: new Date(2026, month, day), ...over }) as Transaction;

const category = (id: string, name: string): Category => ({ id, userId: "u1", name, type: "expense", createdAt: new Date() }) as Category;

const bucket = (id: string, amount: number, categoryIds?: string[]): Bucket => ({ id, label: id, amount, kind: "expense", categoryIds });

describe("spentByCategory", () => {
  it("adds up real spending per category inside the window", () => {
    const spent = spentByCategory([tx("food", 30, 3), tx("food", 20, 9), tx("fuel", 45, 12)], new Date(2026, 8, 1), new Date(2026, 8, 30));

    expect(spent.get("food")).toBe(50);
    expect(spent.get("fuel")).toBe(45);
  });

  it("leaves out anything dated outside it", () => {
    const spent = spentByCategory([tx("food", 30, 3, 7), tx("food", 20, 9)], new Date(2026, 8, 1), new Date(2026, 8, 30));
    expect(spent.get("food")).toBe(20);
  });

  it("does not count a goal deposit as spending", () => {
    // The whole reason it goes through categorySplit: moving money into a goal
    // is a transfer, and a bucket must not report it as having been spent.
    const transfer = tx("food", 200, 5, 8, { isGoalTransaction: true, contributionType: "deposit" });
    expect(spentByCategory([tx("food", 30, 3), transfer], new Date(2026, 8, 1), new Date(2026, 8, 30)).get("food")).toBe(30);
  });
});

describe("bucketActual", () => {
  const spent = new Map([
    ["food", 187],
    ["bet", 240],
  ]);

  it("reports what is left of a bucket", () => {
    expect(bucketActual(bucket("b", 250, ["food"]), spent)).toMatchObject({ spent: 187, left: 63, unmeasured: false });
  });

  it("goes negative when the bucket has been overspent", () => {
    const over = bucketActual(bucket("b", 50, ["bet"]), spent);

    expect(over.left).toBe(-190);
    expect(over.used).toBeCloseTo(4.8, 5);
  });

  it("adds several categories into one bucket", () => {
    expect(bucketActual(bucket("b", 500, ["food", "bet"]), spent).spent).toBe(427);
  });

  it("counts money carried in as part of the budget", () => {
    expect(bucketActual(bucket("b", 250, ["food"]), spent, 40)).toMatchObject({ left: 103 });
  });

  it("says a bucket with no categories is unmeasured rather than unspent", () => {
    // "Spent 0" would be a claim the app cannot support.
    expect(bucketActual(bucket("b", 100), spent)).toMatchObject({ unmeasured: true, spent: 0, left: 100 });
  });
});

describe("nextRollover", () => {
  const spent = new Map([
    ["food", 187],
    ["bet", 240],
  ]);

  it("carries what was not spent into the next month", () => {
    expect(nextRollover([bucket("a", 250, ["food"])], {}, spent)).toEqual({ a: 63 });
  });

  it("carries nothing forward from a bucket that was overspent", () => {
    // Real, and reported where it happened — but a hole that compounds month
    // after month is a number nobody can act on.
    expect(nextRollover([bucket("a", 50, ["bet"])], {}, spent)).toEqual({});
  });

  it("compounds an unspent balance that was already carried", () => {
    expect(nextRollover([bucket("a", 250, ["food"])], { a: 40 }, spent)).toEqual({ a: 103 });
  });

  it("carries nothing from an unmeasured bucket", () => {
    // Carrying its full amount would assert that nothing was spent.
    expect(nextRollover([bucket("a", 100)], {}, spent)).toEqual({});
  });
});

describe("extraPayForMonth", () => {
  const now = new Date(2026, 8, 5); // 5 Sep 2026
  const pay = [
    { id: "o1", label: "Christmas", amount: 1400, date: "2026-12-20" },
    { id: "o2", label: "Easter", amount: 700, date: "2027-04-20" },
    { id: "o3", label: "Holiday", amount: 700, date: "2027-07-30" },
  ];

  it("counts nothing in a month nothing lands in", () => {
    expect(extraPayForMonth(pay, "when", now)).toBe(0);
  });

  it("counts the whole lump in the month it lands", () => {
    expect(extraPayForMonth(pay, "when", new Date(2026, 11, 1))).toBe(1400);
  });

  it("spreads a year of extra pay evenly", () => {
    // 2,800 over twelve months, which is the point: December can afford
    // anything and January cannot, unless the two are levelled.
    expect(extraPayForMonth(pay, "spread", now)).toBe(Math.round((2800 / 12) * 100) / 100);
  });

  it("counts a repeat every time it lands, not just the first time", () => {
    // A coupon every three months is four arrivals a year; counting the day it
    // was entered on and nothing else understated the year by three of them.
    const coupon = [{ id: "c1", label: "Coupon", amount: 250, date: "2026-03-15", every: 3 }];

    expect(extraPayForMonth(coupon, "when", new Date(2026, 8, 5))).toBe(250); // 15 Sep
    expect(extraPayForMonth(coupon, "when", new Date(2026, 9, 5))).toBe(0); // October: nothing
    expect(extraPayForMonth(coupon, "spread", new Date(2026, 8, 5))).toBe(Math.round(((250 * 4) / 12) * 100) / 100);
  });

  it("stops counting a repeat once it has ended", () => {
    const ended = [{ id: "c1", label: "Coupon", amount: 250, date: "2026-03-15", every: 3, until: "2026-09-15" }];

    expect(extraPayForMonth(ended, "when", new Date(2026, 8, 5))).toBe(250);
    expect(extraPayForMonth(ended, "when", new Date(2026, 11, 5))).toBe(0);
  });

  it("ignores a date it cannot read", () => {
    expect(extraPayForMonth([{ id: "x", label: "bad", amount: 500, date: "not-a-date" }], "spread", now)).toBe(0);
  });
});

describe("emergencyTarget", () => {
  it("is months of committed costs, not of income", () => {
    // What a bad month has to cover is the rent, not the salary that did not
    // arrive.
    expect(emergencyTarget({ bills: 600, goals: 100, debts: 50, total: 750 }, 3)).toBe(2250);
  });

  it("never asks for less than one month", () => {
    expect(emergencyTarget({ bills: 0, goals: 0, debts: 0, total: 750 }, 0)).toBe(750);
  });
});

describe("seedFromHistory", () => {
  const now = new Date(2026, 8, 15); // mid-September
  const categories = [category("food", "Food"), category("fuel", "Fuel"), category("odd", "Odd")];
  let n = 0;
  const ids = () => `b${n++}`;

  const threeMonths = [
    tx("food", 300, 5, 5), tx("food", 300, 5, 6), tx("food", 300, 5, 7),
    tx("fuel", 60, 8, 5), tx("fuel", 60, 8, 6), tx("fuel", 60, 8, 7),
    tx("odd", 1.5, 8, 6),
  ];

  it("averages each category over the complete months behind it", () => {
    n = 0;
    const seeded = seedFromHistory(threeMonths, categories, ids, now, 3);

    expect(seeded.map((b) => [b.label, b.amount])).toEqual([
      ["Food", 300],
      ["Fuel", 60],
    ]);
  });

  it("links each bucket to the category it came from", () => {
    n = 0;
    expect(seedFromHistory(threeMonths, categories, ids, now, 3)[0].categoryIds).toEqual(["food"]);
  });

  it("leaves out the month in progress", () => {
    // Counting a half-finished September would halve every figure on the 15th.
    n = 0;
    const withThisMonth = [...threeMonths, tx("food", 900, 14, 8)];
    expect(seedFromHistory(withThisMonth, categories, ids, now, 3)[0].amount).toBe(300);
  });

  it("drops a category too small to be worth a row", () => {
    n = 0;
    expect(seedFromHistory(threeMonths, categories, ids, now, 3).some((b) => b.label === "Odd")).toBe(false);
  });

  it("gives nothing back when there is no history to read", () => {
    n = 0;
    expect(seedFromHistory([], categories, ids, now, 3)).toEqual([]);
  });
});
