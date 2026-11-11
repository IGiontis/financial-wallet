import { describe, expect, it } from "vitest";
import type { Category } from "../../shared/types/IndexTypes";
import { INCOME_KINDS, KIND_ICON, incomeIcon, kindForCategory, suggestIncomeCategory } from "./incomesUtils";

// The form asks the category only; the kind is read off it and still stored.

const cat = (id: string, name: string, icon?: string): Category => ({ id, name, icon, type: "income", userId: "u1", isDefault: false }) as Category;

describe("kindForCategory", () => {
  it("reads the kind a seeded or own category means, in both languages", () => {
    expect(kindForCategory(cat("a", "Salary"))).toBe("salary");
    expect(kindForCategory(cat("b", "Μισθός"))).toBe("salary");
    expect(kindForCategory(cat("c", "Freelance"))).toBe("work");
    expect(kindForCategory(cat("d", "Government Aid"))).toBe("allowance");
    expect(kindForCategory(cat("e", "  ενοίκια "))).toBe("rent");
    expect(kindForCategory(cat("f", "Σύνταξη"))).toBe("pension");
  });

  it("is «other» for any other category, or none", () => {
    expect(kindForCategory(cat("g", "Μερίσματα"))).toBe("other");
    expect(kindForCategory(cat("h", "Other Income"))).toBe("other");
    expect(kindForCategory(undefined)).toBe("other");
  });

  it("is the reverse of the suggestion: the category suggested for a kind reads back as that kind", () => {
    const categories = [cat("s", "Salary"), cat("w", "Freelance"), cat("al", "Government Aid"), cat("r", "Ενοίκια"), cat("p", "Σύνταξη"), cat("o", "Other Income")];
    for (const kind of INCOME_KINDS) expect(kindForCategory(suggestIncomeCategory(kind, categories)), kind).toBe(kind);
  });
});

describe("incomeIcon", () => {
  const categories = [cat("c1", "Freelance", "🎨"), cat("c2", "Μερίσματα")];

  it("is the category's icon", () => {
    expect(incomeIcon({ kind: "other", categoryId: "c1" }, categories)).toBe("🎨");
  });

  it("an old record whose category has no icon, or no category, still shows its kind's icon", () => {
    expect(incomeIcon({ kind: "rent", categoryId: "c2" }, categories)).toBe(KIND_ICON.rent);
    expect(incomeIcon({ kind: "pension" }, categories)).toBe(KIND_ICON.pension);
    expect(incomeIcon({ kind: "salary", categoryId: "gone" }, [])).toBe(KIND_ICON.salary);
  });
});
