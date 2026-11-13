import { describe, it, expect } from "vitest";
import i18n from "../../i18n";
import { buildSearchNames, categoryChoices, matchesSearch } from "./transactionFilter";
import { computeFilterTotals } from "./filterTotals";
import { buildLedger } from "./ledger";
import { closingFigures, personalRecord } from "../business/businessSummary";
import { BUSINESS_CATEGORY_ID, DEBT_CATEGORY_ID, TRANSFER_CATEGORY_ID, categoryLabel, findCategory } from "../../shared/utils/categories";
import type { BusinessEntryInput, Transaction } from "../../shared/types/IndexTypes";

// A business day's record in the owner's own money («Κέρδος · Φαρμακείο»,
// category «Δουλειά») must be found like any other: picked in the category
// filter, and by its category, business or kind in the search. And the
// filter's totals must be the closings' profits and losses — worked out by
// hand, then a second way from the closings themselves, then a third through
// the ledger.

const ts = [i18n.getFixedT("el"), i18n.getFixedT("en")];
const businesses = [
  { id: "b1", name: "Φαρμακείο" },
  { id: "b2", name: "Λαϊκή" },
];
const names = buildSearchNames(ts, businesses);
const el = i18n.getFixedT("el");

const day = (d: number) => new Date(2026, 9, d);
const closing = (businessId: string, d: number, incomes: number[], expenses: number[]): BusinessEntryInput =>
  ({
    businessId,
    date: day(d),
    incomes: incomes.map((amount, i) => ({ lineId: `${businessId}-in${i}`, amount })),
    expenses: expenses.map((amount, i) => ({ lineId: `${businessId}-out${i}`, amount })),
  }) as BusinessEntryInput;

// By hand: 1.200 + 300,50 − 400 − 85,20 = 1.015,30 profit; 200 − 350,75 = −150,75 a loss;
// 180 − 60 − 12,40 = 107,60 profit; 50 − 50 = 0, which writes nothing.
const CLOSINGS = [
  closing("b1", 2, [1200, 300.5], [400, 85.2]),
  closing("b1", 5, [200], [350.75]),
  closing("b2", 9, [180], [60, 12.4]),
  closing("b2", 12, [50], [50]),
];

let n = 0;
const record = (extra: Partial<Transaction>): Transaction =>
  ({ id: `t${++n}`, userId: "u", type: "expense", categoryId: "food", description: "", amount: 0, date: day(1), createdAt: day(1), updatedAt: day(1), ...extra }) as Transaction;

const businessRecords = CLOSINGS.map((c) => {
  const name = businesses.find((b) => b.id === c.businessId)!.name;
  const dto = personalRecord(c, (type) => el(type === "income" ? "business.recordProfit" : "business.recordLoss", { name }));
  return dto ? record({ ...dto, createdAt: c.date }) : null;
}).filter((r): r is Transaction => r !== null);

const CATEGORIES = [
  { id: "food", name: "Groceries", icon: "🛒", type: "expense" },
  { id: "salary", name: "Salary", icon: "💼", type: "income" },
  { id: "other-in", name: "Άλλο", icon: "•", type: "income" },
  { id: "other-out", name: "Άλλο", icon: "•", type: "expense" },
  { id: "unused", name: "Gym", icon: "🏋", type: "expense" },
];

const RECORDS: Transaction[] = [
  ...businessRecords,
  record({ type: "income", categoryId: "salary", amount: 1450, description: "Μισθός", date: day(1) }),
  record({ categoryId: "food", amount: 50, description: "Lidl", date: day(3) }),
  record({ categoryId: TRANSFER_CATEGORY_ID, amount: 200, description: "Revolut → Eurobank", transferId: "x", transferPart: "out", date: day(4) }),
  record({ type: "income", categoryId: TRANSFER_CATEGORY_ID, amount: 200, description: "Revolut → Eurobank", transferId: "x", transferPart: "in", date: day(4) }),
  record({ type: "income", categoryId: DEBT_CATEGORY_ID, amount: 500, description: "Δάνειο", debtId: "d", debtPart: "loan", date: day(6) }),
  // A note that happens to say «κέρδος»: found by the search, never by the category.
  record({ type: "income", categoryId: "other-in", amount: 20, description: "Κέρδος από στοίχημα", date: day(7) }),
];

const label = (name: string) => categoryLabel(name, el);
const round2 = (x: number) => Math.round(x * 100) / 100;

describe("the closings' records, as written", () => {
  it("are three: two profits and a loss — the day at zero writes nothing", () => {
    expect(businessRecords.map((r) => [r.type, r.amount, r.description, r.categoryId])).toEqual([
      ["income", 1015.3, "Κέρδος · Φαρμακείο", BUSINESS_CATEGORY_ID],
      ["expense", 150.75, "Ζημιά · Φαρμακείο", BUSINESS_CATEGORY_ID],
      ["income", 107.6, "Κέρδος · Λαϊκή", BUSINESS_CATEGORY_ID],
    ]);
  });
});

describe("the category filter", () => {
  const choices = categoryChoices(CATEGORIES, RECORDS, { label });

  it("offers «Δουλειά», «Μεταφορά» and «Δάνεια» once some record carries them — never «Τόκοι» unused", () => {
    const virtual = choices.filter((c) => c.value.startsWith("__")).map((c) => c.value);
    expect(virtual.sort()).toEqual([BUSINESS_CATEGORY_ID, DEBT_CATEGORY_ID, TRANSFER_CATEGORY_ID].sort());
    const business = choices.find((c) => c.value === BUSINESS_CATEGORY_ID)!;
    expect([business.icon, label(business.name), business.ids]).toEqual(["🏪", "Δουλειά", [BUSINESS_CATEGORY_ID]]);
  });

  it("offers no «Δουλειά» when nobody has a business record", () => {
    const without = categoryChoices(CATEGORIES, RECORDS.filter((r) => r.categoryId !== BUSINESS_CATEGORY_ID), { label });
    expect(without.some((c) => c.value === BUSINESS_CATEGORY_ID)).toBe(false);
  });

  it("keeps the user's categories one per name (income «Άλλο» and expense «Άλλο» as one), unused ones too — or only the used, for the ledger", () => {
    const other = choices.find((c) => label(c.name) === "Άλλο")!;
    expect(other.ids).toEqual(["other-in", "other-out"]);
    expect(choices.some((c) => c.value === "Gym")).toBe(true);
    const used = categoryChoices(CATEGORIES, RECORDS, { label, onlyUsed: true });
    expect(used.some((c) => c.value === "Gym")).toBe(false);
    expect(used.some((c) => c.value === BUSINESS_CATEGORY_ID)).toBe(true);
  });

  it("sorts by the name shown", () => {
    const shown = choices.map((c) => label(c.name));
    expect(shown).toEqual([...shown].sort((a, b) => a.localeCompare(b)));
  });

  it("«Δουλειά» keeps exactly the business records, and its totals are the closings' profits and losses", () => {
    const ids = choices.find((c) => c.value === BUSINESS_CATEGORY_ID)!.ids;
    const kept = RECORDS.filter((r) => ids.includes(r.categoryId));
    expect(kept.map((r) => r.id)).toEqual(businessRecords.map((r) => r.id));

    const totals = computeFilterTotals(kept);
    // By hand: in 1.015,30 + 107,60 = 1.122,90; out 150,75; net 972,15.
    expect([round2(totals.earned), round2(totals.spent), round2(totals.net), totals.count]).toEqual([1122.9, 150.75, 972.15, 3]);
    // A second way: Σ of the closings' own profits (the zero day adds 0).
    const profits = CLOSINGS.reduce((sum, c) => sum + Math.round(closingFigures(c).profit * 100), 0) / 100;
    expect(profits).toBe(972.15);
    expect(round2(totals.net)).toBe(profits);
    // A third: the ledger, filtered the same way — in, out, net and its «Από πού ήρθαν» line.
    const ledger = buildLedger(RECORDS, { from: day(1), to: day(31), now: day(31), categories: ids });
    expect([ledger.in, ledger.out, ledger.net, ledger.count]).toEqual([1122.9, 150.75, 972.15, 3]);
    expect(ledger.earning.map((c) => [c.categoryId, c.amount, c.count])).toEqual([[BUSINESS_CATEGORY_ID, 1122.9, 2]]);
    expect(ledger.spending.map((c) => [c.categoryId, c.amount, c.count])).toEqual([[BUSINESS_CATEGORY_ID, 150.75, 1]]);
  });
});

describe("the search", () => {
  const found = (query: string) =>
    RECORDS.filter((r) => matchesSearch(r, query, findCategory(CATEGORIES, r.categoryId), names)).map((r) => r.description);

  it("finds the business records by «Δουλειά» or «Business», with or without accents", () => {
    const all = ["Κέρδος · Φαρμακείο", "Ζημιά · Φαρμακείο", "Κέρδος · Λαϊκή"];
    expect(found("Δουλειά")).toEqual(all);
    expect(found("δουλεια")).toEqual(all);
    expect(found("business")).toEqual(all);
  });

  it("finds them by the business's name, and by «Κέρδος» / «Ζημιά» in either language", () => {
    expect(found("Φαρμακείο")).toEqual(["Κέρδος · Φαρμακείο", "Ζημιά · Φαρμακείο"]);
    expect(found("λαικη")).toEqual(["Κέρδος · Λαϊκή"]);
    expect(found("Κέρδος")).toEqual(["Κέρδος · Φαρμακείο", "Κέρδος · Λαϊκή", "Κέρδος από στοίχημα"]);
    expect(found("profit")).toEqual(["Κέρδος · Φαρμακείο", "Κέρδος · Λαϊκή"]);
    expect(found("Ζημιά")).toEqual(["Ζημιά · Φαρμακείο"]);
    expect(found("loss")).toEqual(["Ζημιά · Φαρμακείο"]);
  });

  it("finds a renamed business by its new name", () => {
    const renamed = buildSearchNames(ts, [{ id: "b1", name: "Φαρμακείο Κέντρου" }, businesses[1]]);
    const hits = RECORDS.filter((r) => matchesSearch(r, "κεντρου", findCategory(CATEGORIES, r.categoryId), renamed));
    expect(hits.map((r) => r.amount)).toEqual([1015.3, 150.75]);
  });

  it("finds any record by its category's name in either language, and still by its description", () => {
    // «Groceries» is «Σούπερ μάρκετ» in Greek; the record itself only says «Lidl».
    expect(found("σουπερ μαρκετ")).toEqual(["Lidl"]);
    expect(found("groceries")).toEqual(["Lidl"]);
    expect(found("μισθ")).toEqual(["Μισθός"]);
    expect(found("Μεταφορά")).toEqual(["Revolut → Eurobank", "Revolut → Eurobank"]);
  });

  it("a blank search finds everything", () => {
    expect(found("  ")).toHaveLength(RECORDS.length);
  });
});
