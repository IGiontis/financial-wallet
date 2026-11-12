import { describe, it, expect } from "vitest";
import { buildBusiness, clashingRows, readBusinesses, removedLines } from "./businessEdit";
import type { Business } from "../../shared/types/IndexTypes";

// A business as the form leaves it: kept lines keep their ids (so closings
// read new names with no write), new ones get new ids, one taken off while
// closings name it stays as `removed` (their amounts keep a name), and one
// typed again comes back under its old id. Names are trimmed and compared
// ignoring case, accents and spaces.

let made = 0;
const newId = () => `new-${++made}`;
const pharmacy: Business = {
  id: "biz-ph",
  name: "Φαρμακείο",
  incomeLines: [
    { id: "till", name: "Ταμείο" },
    { id: "eopyy", name: "Συνταγές ΕΟΠΥΥ" },
  ],
  expenseLines: [
    { id: "stock", name: "Εμπορεύματα" },
    { id: "rent", name: "Ενοίκιο" },
    { id: "old", name: "Λογιστής", removed: true },
  ],
};
const uses = new Map([
  ["till", 12],
  ["eopyy", 4],
  ["stock", 12],
  ["old", 3],
]);

describe("buildBusiness", () => {
  it("makes a new business from what was typed — trimmed, empty rows dropped, nothing added", () => {
    made = 0;
    const b = buildBusiness(undefined, { id: "biz-1", name: "  Λαϊκή  ", incomes: [{ name: " Πωλήσεις " }, { name: "  " }], expenses: [] }, new Map(), true, newId);
    expect(b).toEqual({ id: "biz-1", name: "Λαϊκή", incomeLines: [{ id: "new-1", name: "Πωλήσεις" }], expenseLines: [] });
  });

  it("renames a line under its own id, so every closing reads the new name", () => {
    const b = buildBusiness(pharmacy, { id: pharmacy.id, name: "Φαρμακείο Νίκου", incomes: [{ id: "till", name: "Ταμείο μαγαζιού" }, { id: "eopyy", name: "Συνταγές ΕΟΠΥΥ" }], expenses: [{ id: "stock", name: "Εμπορεύματα" }, { id: "rent", name: "Ενοίκιο" }] }, uses, true, newId);
    expect(b.name).toBe("Φαρμακείο Νίκου");
    expect(b.incomeLines[0]).toEqual({ id: "till", name: "Ταμείο μαγαζιού" });
    // The line taken off earlier, still named by 3 closings, stays as it was.
    expect(b.expenseLines).toEqual([{ id: "stock", name: "Εμπορεύματα" }, { id: "rent", name: "Ενοίκιο" }, { id: "old", name: "Λογιστής", removed: true }]);
  });

  it("keeps a line closings use as `removed` when taken off; drops one no closing uses", () => {
    // EOPYY: 4 closings → kept, marked. Rent: none → gone.
    const b = buildBusiness(pharmacy, { id: pharmacy.id, name: "Φαρμακείο", incomes: [{ id: "till", name: "Ταμείο" }], expenses: [{ id: "stock", name: "Εμπορεύματα" }] }, uses, true, newId);
    expect(b.incomeLines).toEqual([{ id: "till", name: "Ταμείο" }, { id: "eopyy", name: "Συνταγές ΕΟΠΥΥ", removed: true }]);
    expect(b.expenseLines).toEqual([{ id: "stock", name: "Εμπορεύματα" }, { id: "old", name: "Λογιστής", removed: true }]);
  });

  it("drops nothing while the closings are not on the device — it only marks", () => {
    const b = buildBusiness(pharmacy, { id: pharmacy.id, name: "Φαρμακείο", incomes: [{ id: "till", name: "Ταμείο" }], expenses: [] }, new Map(), false, newId);
    expect(b.expenseLines.map((l) => [l.id, !!l.removed])).toEqual([
      ["stock", true],
      ["rent", true],
      ["old", true],
    ]);
  });

  it("brings a removed line back under its old id when its name is typed again — any case, accents or spaces", () => {
    const b = buildBusiness(pharmacy, { id: pharmacy.id, name: "Φαρμακείο", incomes: [{ id: "till", name: "Ταμείο" }, { id: "eopyy", name: "Συνταγές ΕΟΠΥΥ" }], expenses: [{ id: "stock", name: "Εμπορεύματα" }, { id: "rent", name: "Ενοίκιο" }, { name: "  λογιστης " }] }, uses, true, newId);
    expect(b.expenseLines).toEqual([
      { id: "stock", name: "Εμπορεύματα" },
      { id: "rent", name: "Ενοίκιο" },
      { id: "old", name: "λογιστης" },
    ]);
  });
});

describe("removedLines and clashingRows", () => {
  it("says which stored lines the form takes off, with how many closings use each", () => {
    expect(removedLines(pharmacy.incomeLines, [{ id: "till", name: "Ταμείο" }, { id: "eopyy", name: "   " }], uses)).toEqual([{ line: { id: "eopyy", name: "Συνταγές ΕΟΠΥΥ" }, uses: 4 }]);
    // A line already removed is not taken off again.
    expect(removedLines(pharmacy.expenseLines, [{ id: "stock", name: "x" }, { id: "rent", name: "y" }], uses)).toEqual([]);
  });

  it("finds a row that repeats an earlier one, ignoring case, accents and spaces", () => {
    expect([...clashingRows([{ name: "Ενοίκιο" }, { name: "Βενζίνη" }, { name: "  ενοικιο " }, { name: "" }, { name: "" }])]).toEqual([2]);
  });
});

describe("readBusinesses", () => {
  it("reads what the user document holds, leaving out anything malformed", () => {
    expect(readBusinesses(undefined)).toEqual([]);
    expect(readBusinesses("nope")).toEqual([]);
    expect(readBusinesses([pharmacy, { id: 3 }, null, { id: "b", name: "B", incomeLines: [{ id: "x" }, { id: "i", name: "I", extra: 1 }], expenseLines: "bad" }])).toEqual([pharmacy, { id: "b", name: "B", incomeLines: [{ id: "i", name: "I" }], expenseLines: [] }]);
  });
});
