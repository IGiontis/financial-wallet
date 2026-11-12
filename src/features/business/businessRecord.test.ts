import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import el from "../../i18n/locales/el.json";
import en from "../../i18n/locales/en.json";
import { BUSINESS_CATEGORY_ID, VIRTUAL_CATEGORIES, categoryLabel, findCategory } from "../../shared/utils/categories";
import { isEarning, isSpending } from "../../shared/utils/moneyModel";
import { carriesPayee } from "../names/payeeNames";
import { moneyFlow, monthlyFlows } from "../analytics/analyticsUtils";
import { closingFigures, personalRecord } from "./businessSummary";
import type { BusinessEntryInput, Category, Transaction } from "../../shared/types/IndexTypes";

// A closing's record in the owner's own money, as every other screen sees it:
// filed under «Δουλειά» with a shop — not a category of the owner's, and no
// category document — counted ONCE, as an income (a profit) or as spending (a
// loss), and never as a payee. Each figure reconciled by hand.

const t = (dict: Record<string, unknown>) =>
  ((key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict) ?? key) as unknown as TFunction;

const userCategories: Category[] = [
  { id: "cat-salary", name: "Salary", type: "income", isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() } as Category,
  // The owner's own category that happens to carry the same word: never confused with the reserved one.
  { id: "cat-own-business", name: "Δουλειά", type: "expense", isDefault: false, userId: "u1", createdAt: new Date(), updatedAt: new Date() } as Category,
];

let n = 0;
const asRecord = (closing: BusinessEntryInput): Transaction | null => {
  const data = personalRecord(closing, (type) => `${type === "income" ? "Κέρδος" : "Ζημιά"} · Φαρμακείο`);
  return data ? ({ ...data, id: `t${++n}`, userId: "u1", businessEntryId: `b${n}`, createdAt: closing.date, updatedAt: closing.date } as Transaction) : null;
};
const day = (d: number, incomes: number[], expenses: number[]): BusinessEntryInput => ({
  businessId: "biz-ph",
  date: new Date(2026, 10, d, 21),
  incomes: incomes.map((amount, i) => ({ lineId: `in${i}`, amount })),
  expenses: expenses.map((amount, i) => ({ lineId: `out${i}`, amount })),
  accountId: "acc-main",
});

describe("the record's category", () => {
  it("is «Δουλειά» / «Business» with a shop, from no document of the owner's", () => {
    const record = asRecord(day(2, [800], [540]))!;
    expect(record.categoryId).toBe(BUSINESS_CATEGORY_ID);
    const category = findCategory(userCategories, record.categoryId)!;
    expect(category).toEqual(VIRTUAL_CATEGORIES[BUSINESS_CATEGORY_ID]);
    expect(category.icon).toBe("🏪");
    expect(categoryLabel(category.name, t(el))).toBe("Δουλειά");
    expect(categoryLabel(category.name, t(en))).toBe("Business");
    // Not among the owner's categories, and the owner's own «Δουλειά» stays his.
    expect(userCategories.some((c) => c.id === BUSINESS_CATEGORY_ID)).toBe(false);
    expect(findCategory(userCategories, "cat-own-business")!.id).toBe("cat-own-business");
  });

  it("is never a payee, and counts once: a profit as an income, a loss as spending", () => {
    const profit = asRecord(day(2, [800], [540]))!;
    const loss = asRecord(day(3, [120], [380]))!;
    expect([carriesPayee(profit), carriesPayee(loss)]).toEqual([false, false]);
    expect([isEarning(profit), isSpending(profit)]).toEqual([true, false]);
    expect([isEarning(loss), isSpending(loss)]).toEqual([false, true]);
  });
});

describe("the month in Statistics, with the business's records in it", () => {
  it("counts each record once, under «Δουλειά» — reconciled by hand", () => {
    const closings = [day(2, [520, 280], [350, 60, 130]), day(3, [640.5], [210.25]), day(4, [120], [380]), day(5, [50], [50])];
    const records = closings.map(asRecord).filter((r): r is Transaction => r !== null);
    // 800 − 540 = +260; 640,50 − 210,25 = +430,25; 120 − 380 = −260; 50 − 50 = 0 (no record).
    expect(records.map((r) => [r.type, r.amount])).toEqual([
      ["income", 260],
      ["income", 430.25],
      ["expense", 260],
    ]);
    const salary = { id: "s", userId: "u1", type: "income", amount: 1720, categoryId: "cat-salary", date: new Date(2026, 10, 30), description: "Μισθός", createdAt: new Date(), updatedAt: new Date() } as Transaction;
    const nov = monthlyFlows([...records, salary], new Date(2026, 10, 1), new Date(2026, 10, 30)).find((m) => m.key === "2026-11")!;
    // Income: 1.720 + 260 + 430,25 = 2.410,25. Spending: the one loss, 260.
    expect(nov.income).toBe(2410.25);
    expect(nov.expenses).toBe(260);
    // A second way: the month's net is the salary plus the closings' profit, 1.720 + (260 + 430,25 − 260 + 0).
    const profit = closings.reduce((s, c) => s + Math.round(closingFigures(c).profit * 100), 0) / 100;
    expect(profit).toBe(430.25);
    expect(nov.net).toBe(1720 + profit);
    // In the money-flow chart: one source «Δουλειά» of the profits, one sink «Δουλειά» of the loss.
    const flow = moneyFlow([...records, salary])!;
    expect(flow.nodes.find((x) => x.id === `in:${BUSINESS_CATEGORY_ID}`)!.value).toBe(690.25);
    expect(flow.nodes.find((x) => x.id === `out:${BUSINESS_CATEGORY_ID}`)!.value).toBe(260);
    expect(flow.nodes.filter((x) => x.categoryId === "cat-own-business")).toEqual([]);
  });
});
