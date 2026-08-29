import { describe, it, expect } from "vitest";
import { cleanCategoryName, findDuplicateCategory, findScopeDuplicates, firstGrapheme, groupCategories, normalizeCategoryName, scopeTypes } from "./categoryNames";
import type { Category } from "../types/IndexTypes";

const cat = (name: string, type: "income" | "expense" = "expense"): Category =>
  ({ id: name + type, name, type, isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() }) as Category;

describe("normalizeCategoryName", () => {
  it("ignores case", () => {
    expect(normalizeCategoryName("ΕΝΟΙΚΙΟ")).toBe(normalizeCategoryName("ενοικιο"));
  });

  it("ignores Greek accents", () => {
    expect(normalizeCategoryName("Ενοίκιο")).toBe(normalizeCategoryName("Ενοικιο"));
  });

  it("ignores Latin accents", () => {
    expect(normalizeCategoryName("Café")).toBe(normalizeCategoryName("Cafe"));
  });

  it("folds final sigma", () => {
    expect(normalizeCategoryName("Φως")).toBe(normalizeCategoryName("φωσ"));
  });

  it("collapses surrounding and repeated whitespace", () => {
    expect(normalizeCategoryName("  Dining   Out ")).toBe("dining out");
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizeCategoryName("Δόσεις")).not.toBe(normalizeCategoryName("Δώρα"));
  });
});

describe("findDuplicateCategory", () => {
  const existing = [cat("Rent"), cat("Groceries"), cat("Investments"), cat("Investments", "income")];

  it("passes a genuinely new name", () => {
    expect(findDuplicateCategory("Δόσεις αυτοκινήτου", "expense", existing)).toBeUndefined();
  });

  it("catches the same name in a different case", () => {
    expect(findDuplicateCategory("rent", "expense", existing)?.name).toBe("Rent");
  });

  it("catches the Greek label of an English default", () => {
    // The user sees "Ενοίκιο" on screen; the document is stored as "Rent".
    expect(findDuplicateCategory("Ενοίκιο", "expense", existing)?.name).toBe("Rent");
  });

  it("catches the Greek label typed without accents", () => {
    expect(findDuplicateCategory("ενοικιο", "expense", existing)?.name).toBe("Rent");
  });

  it("catches a user category re-typed in another case", () => {
    expect(findDuplicateCategory("δοσεισ", "expense", [...existing, cat("Δόσεις")])?.name).toBe("Δόσεις");
  });

  it("scopes the check to one type", () => {
    // An expense "Investments" already exists, but this is a new income one.
    expect(findDuplicateCategory("Ενοίκιο", "income", existing)).toBeUndefined();
  });

  it("treats blank input as nothing to collide with", () => {
    expect(findDuplicateCategory("   ", "expense", existing)).toBeUndefined();
  });
});

describe("cleanCategoryName", () => {
  it("trims and collapses but keeps the user's capitalisation", () => {
    expect(cleanCategoryName("  Δόσεις   Αυτοκινήτου ")).toBe("Δόσεις Αυτοκινήτου");
  });
});

describe("groupCategories", () => {
  it("keeps a one-sided category as a single row", () => {
    const groups = groupCategories([cat("Δόσεις")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].scope).toBe("expense");
  });

  it("folds a matched pair into one row marked as both", () => {
    const groups = groupCategories([cat("Στοίχημα"), cat("Στοίχημα", "income")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].scope).toBe("both");
    expect(groups[0].members).toHaveLength(2);
  });

  it("reunites a pair typed with different accents and case", () => {
    const groups = groupCategories([cat("Στοίχημα"), cat("στοιχημα", "income")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].scope).toBe("both");
  });

  it("does not call two same-type categories 'both'", () => {
    // Same type twice is a duplicate, not a category that works both ways.
    const groups = groupCategories([cat("Δόσεις"), cat("δοσεισ")]);
    expect(groups[0].scope).toBe("expense");
  });

  it("keeps genuinely different categories apart", () => {
    expect(groupCategories([cat("Δόσεις"), cat("Δώρα")])).toHaveLength(2);
  });

  it("sorts rows by name", () => {
    expect(groupCategories([cat("Rent"), cat("Groceries")]).map((g) => g.name)).toEqual(["Groceries", "Rent"]);
  });
});

describe("findScopeDuplicates", () => {
  const existing = [cat("Rent"), cat("Salary", "income")];

  it("passes a genuinely new both-ways category", () => {
    expect(findScopeDuplicates("Στοίχημα", "both", existing)).toEqual([]);
  });

  it("refuses 'both' when only the expense half already exists", () => {
    // Creating it would silently add just the income document, leaving the user
    // with a pair they never asked to build one piece at a time.
    expect(findScopeDuplicates("Rent", "both", existing).map((c) => c.name)).toEqual(["Rent"]);
  });

  it("refuses 'both' when only the income half already exists", () => {
    expect(findScopeDuplicates("Salary", "both", existing).map((c) => c.name)).toEqual(["Salary"]);
  });

  it("allows an income category whose name exists only as an expense", () => {
    expect(findScopeDuplicates("Rent", "income", existing)).toEqual([]);
  });

  it("matches across languages for both halves", () => {
    expect(findScopeDuplicates("Ενοίκιο", "both", existing).map((c) => c.name)).toEqual(["Rent"]);
  });
});

describe("scopeTypes", () => {
  it("expands both into one entry per type", () => {
    expect(scopeTypes("both")).toEqual(["expense", "income"]);
  });

  it("leaves a single scope alone", () => {
    expect(scopeTypes("income")).toEqual(["income"]);
  });
});

describe("firstGrapheme", () => {
  it("returns a plain character", () => {
    expect(firstGrapheme("A")).toBe("A");
  });

  it("keeps a surrogate-pair emoji whole", () => {
    // "👍".length is 2 — slicing by index would return half a character.
    expect(firstGrapheme("👍")).toBe("👍");
  });

  it("keeps a joined emoji sequence whole", () => {
    expect(firstGrapheme("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("keeps a flag whole", () => {
    expect(firstGrapheme("🇬🇷")).toBe("🇬🇷");
  });

  it("takes only the first when several are typed", () => {
    expect(firstGrapheme("🚗🏠")).toBe("🚗");
  });

  it("ignores surrounding whitespace", () => {
    expect(firstGrapheme("  🎓 ")).toBe("🎓");
  });

  it("returns empty for an empty field", () => {
    expect(firstGrapheme("   ")).toBe("");
  });
});
