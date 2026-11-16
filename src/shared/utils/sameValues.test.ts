import { describe, it, expect } from "vitest";
import { asNumber, asSet, sameAsStored, sameValues } from "./sameValues";

// «No change, no Save» (the owner, 2026-11-16: edit forms let him press Save
// with nothing changed). Two values are the same when they MEAN the same —
// each case below is one a form really produces.

describe("sameValues — text", () => {
  it("a trailing or leading space, or two spaces inside, is no change", () => {
    expect(sameValues("Σούπερ μάρκετ ", "Σούπερ μάρκετ")).toBe(true);
    expect(sameValues("  Σούπερ   μάρκετ", "Σούπερ μάρκετ")).toBe(true);
    expect(sameValues({ name: "ΔΕΗ " }, { name: "ΔΕΗ" })).toBe(true);
  });

  it("a different letter, or another case, is a change", () => {
    expect(sameValues("ΔΕΗ", "ΔΕΥΑ")).toBe(false);
    expect(sameValues("doro", "Doro")).toBe(false);
  });

  it("a note keeps its line breaks: a new line is a change, a trailing space on a line is not", () => {
    expect(sameValues("one\ntwo", "one two")).toBe(false);
    expect(sameValues("one \ntwo", "one\ntwo")).toBe(true);
  });

  it("two texts are never compared as numbers: a code «007» is not «7»", () => {
    expect(sameValues("007", "7")).toBe(false);
  });
});

describe("sameValues — numbers", () => {
  it("50 = 50.00 = «50» = «50,00»", () => {
    expect(sameValues(50, 50.0)).toBe(true);
    expect(sameValues(50, "50")).toBe(true);
    expect(sameValues("50,00", 50)).toBe(true);
    expect(sameValues({ amount: "50.00" }, { amount: 50 })).toBe(true);
  });

  it("float noise is not a change (0.1 + 0.2 is 0.3), a cent is", () => {
    expect(sameValues(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameValues(50, 50.01)).toBe(false);
    expect(sameValues(1234567.89, 1234567.9)).toBe(false);
  });

  it("0 is a figure, not «empty»: 0 against nothing is a change", () => {
    expect(sameValues(0, undefined)).toBe(false);
    expect(sameValues(0, "")).toBe(false);
    expect(sameValues(-0, 0)).toBe(true);
  });

  it("asNumber reads a figure typed as text", () => {
    expect(asNumber("50,5")).toBe(50.5);
    expect(asNumber(" 12 ")).toBe(12);
    expect(asNumber("")).toBeUndefined();
    expect(asNumber("abc")).toBeUndefined();
    expect(asNumber(Number.NaN)).toBeUndefined();
  });
});

describe("sameValues — dates as calendar days", () => {
  it("the same day at another hour is no change", () => {
    expect(sameValues(new Date(2026, 10, 16, 9, 0), new Date(2026, 10, 16, 23, 59))).toBe(true);
  });

  it("a Date, a Firestore Timestamp and «2026-11-16» are one day", () => {
    const day = new Date(2026, 10, 16, 14, 30);
    const timestamp = { seconds: Math.floor(day.getTime() / 1000), nanoseconds: 0 };
    const withToDate = { toDate: () => day };
    expect(sameValues(timestamp, "2026-11-16")).toBe(true);
    expect(sameValues(withToDate, new Date(2026, 10, 16))).toBe(true);
    expect(sameValues({ date: "2026-11-16" }, { date: day })).toBe(true);
  });

  it("the next day is a change — across a month and a year end too", () => {
    expect(sameValues(new Date(2026, 10, 16), new Date(2026, 10, 17))).toBe(false);
    expect(sameValues(new Date(2026, 11, 31, 23, 59), new Date(2027, 0, 1, 0, 1))).toBe(false);
    expect(sameValues("2026-10-31", "2026-11-01")).toBe(false);
  });

  it("a month «2026-11» stays a month", () => {
    expect(sameValues("2026-11", "2026-11")).toBe(true);
    expect(sameValues("2026-11", "2026-12")).toBe(false);
  });
});

describe("sameValues — empty is absent", () => {
  it("an optional field left empty equals one never stored", () => {
    expect(sameValues({ notes: "" }, {})).toBe(true);
    expect(sameValues({ notes: "   " }, { notes: undefined })).toBe(true);
    expect(sameValues({ accountId: null }, {})).toBe(true);
    expect(sameValues({ parts: [] }, {})).toBe(true);
    expect(sameValues({ pause: {} }, { pause: null })).toBe(true);
  });

  it("but text typed into an empty field is a change", () => {
    expect(sameValues({ notes: "" }, { notes: "x" })).toBe(false);
  });

  it("false is an answer, not «empty»", () => {
    expect(sameValues({ yearly: false }, {})).toBe(false);
    expect(sameValues(false, false)).toBe(true);
  });
});

describe("sameValues — lists and records", () => {
  it("lists by content, in order (a goal's parts are filled in order)", () => {
    expect(sameValues([{ label: "Hotel", max: 300 }], [{ label: "Hotel ", max: "300" }])).toBe(true);
    expect(sameValues(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameValues(["a"], ["a", "b"])).toBe(false);
  });

  it("asSet: a list whose order means nothing (picked categories)", () => {
    expect(sameValues(asSet(["food", "fuel"]), asSet(["fuel", "food"]))).toBe(true);
    expect(sameValues(asSet(["food"]), asSet(["food", "fuel"]))).toBe(false);
  });

  it("two copies of a record with the same ids are the same — never by object identity", () => {
    const a = { id: "b1", name: "Gym", lines: [{ id: "l1", name: "Fees" }] };
    expect(sameValues(a, structuredClone(a))).toBe(true);
    expect(sameValues(a, { ...a, lines: [{ id: "l2", name: "Fees" }] })).toBe(false);
  });

  it("key order does not matter (the JSON text compare it replaces did)", () => {
    expect(sameValues({ id: "x", name: "A" }, { name: "A", id: "x" })).toBe(true);
  });

  it("changed and changed back is the same again", () => {
    const stored = { name: "Rent", amount: 500 };
    const form = { ...stored };
    form.amount = 520;
    expect(sameValues(stored, form)).toBe(false);
    form.amount = 500;
    expect(sameValues(stored, form)).toBe(true);
  });
});

describe("sameAsStored — the data layer's net", () => {
  const stored = { id: "t1", amount: 50, description: "Coffee", date: new Date(2026, 10, 16, 8), categoryId: "food", notes: "morning", updatedAt: new Date(2026, 10, 16, 8) };

  it("an update whose every field is already stored writes nothing", () => {
    expect(sameAsStored(stored, { amount: 50, description: "Coffee ", date: new Date(2026, 10, 16) })).toBe(true);
  });

  it("only the update's own fields count — the record's others are not being touched", () => {
    expect(sameAsStored(stored, { categoryId: "food" })).toBe(true);
  });

  it("one field different is a write", () => {
    expect(sameAsStored(stored, { amount: 50, description: "Coffee", categoryId: "fun" })).toBe(false);
  });

  it("clearing a field (null / empty) matches only a field that is absent", () => {
    expect(sameAsStored(stored, { notes: null })).toBe(false);
    expect(sameAsStored({ ...stored, notes: undefined }, { notes: null })).toBe(true);
  });

  it("no stored record (not in the cache): never judged unchanged", () => {
    expect(sameAsStored(undefined, { amount: 50 })).toBe(false);
  });
});
