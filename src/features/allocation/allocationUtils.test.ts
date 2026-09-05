import { describe, it, expect } from "vitest";
import { allocate, applyPreset, assignRemainder, bucketCeiling, committedMonthly, extraFor, monthKey, PRESETS, setBucketAmount } from "./allocationUtils";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

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

  it("gives no share when there is nothing to take a share of", () => {
    const a = allocate(0, noCommitment, [line("food", 100)]);
    expect(a.buckets[0].share).toBe(0);
  });

  it("spreads a bucket across an average month", () => {
    expect(allocate(1000, noCommitment, [line("food", 420)]).buckets[0].perDay).toBeCloseTo(13.8, 1);
  });
});

describe("applyPreset", () => {
  const labelFor = (key: string) => key;
  let n = 0;
  const newId = () => `b${n++}`;

  it("lands exactly on the pot, with the rounding on the last row", () => {
    for (const preset of PRESETS) {
      const lines = applyPreset(preset, 1050, labelFor, newId);
      const total = lines.reduce((sum, l) => sum + l.amount, 0);
      // A page that opens saying three cents are unaccounted for is a page
      // that taught the reader to ignore the figure.
      expect(Math.round(total * 100) / 100).toBe(1050);
    }
  });

  it("handles an awkward pot without drift", () => {
    const lines = applyPreset(PRESETS[0], 1033.33, labelFor, newId);
    expect(Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100).toBe(1033.33);
  });

  it("puts saving first when that is the point of the preset", () => {
    const payFirst = PRESETS.find((p) => p.id === "payYourselfFirst")!;
    expect(payFirst.buckets[0].labelKey).toBe("investing");
  });

  it("returns nothing when there is nothing to divide", () => {
    expect(applyPreset(PRESETS[0], 0, labelFor, newId)).toEqual([]);
    expect(applyPreset(PRESETS[0], -50, labelFor, newId)).toEqual([]);
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
