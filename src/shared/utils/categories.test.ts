import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { CATEGORY_KEYS, categoryLabel } from "./categories";
import en from "../../i18n/locales/en.json";
import el from "../../i18n/locales/el.json";

// The stored category name is an identity value — it is what filters compare,
// what `<option value>` carries and what Firestore queries match on. This map
// only decides what the reader sees on top of it, so the thing worth testing is
// that it never changes the value and never leaves a raw key on screen.

/** Stands in for i18next: returns the key itself, so a lookup is visible. */
const t = ((key: string) => `t:${key}`) as unknown as TFunction;

describe("categoryLabel", () => {
  it("translates a category the app seeded", () => {
    expect(categoryLabel("Groceries", t)).toBe("t:categories.groceries");
    expect(categoryLabel("Dining Out", t)).toBe("t:categories.diningOut");
  });

  it("leaves a category the user typed exactly as they typed it", () => {
    // No entry means it is theirs, and inventing a translation for it would be
    // renaming their data.
    expect(categoryLabel("Πετρέλαιο θέρμανσης", t)).toBe("Πετρέλαιο θέρμανσης");
    expect(categoryLabel("Groceries ", t)).toBe("Groceries "); // not trimmed, not matched
  });

  it("gives nothing back for nothing", () => {
    expect(categoryLabel(undefined, t)).toBe("");
    expect(categoryLabel(null, t)).toBe("");
    expect(categoryLabel("", t)).toBe("");
  });

  it("is case- and space-sensitive, because the stored name is the identity", () => {
    expect(categoryLabel("groceries", t)).toBe("groceries");
    expect(categoryLabel("DiningOut", t)).toBe("DiningOut");
  });
});

describe("every mapped category has something to show", () => {
  // A key with no translation renders as "categories.foo" on the screen — the
  // one failure mode of this file, and invisible until someone sees it.
  const locales: Record<string, Record<string, string>> = { en: en.categories, el: el.categories };

  for (const [name, locale] of Object.entries(locales)) {
    it(`has a ${name} name for all ${Object.keys(CATEGORY_KEYS).length} of them`, () => {
      const missing = Object.entries(CATEGORY_KEYS)
        .filter(([, key]) => !locale[key]?.trim())
        .map(([category, key]) => `${category} -> categories.${key}`);

      expect(missing).toEqual([]);
    });
  }

  it("maps each stored name to its own key, with no two sharing one", () => {
    const keys = Object.values(CATEGORY_KEYS);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the Greek and English lists the same size", () => {
    expect(Object.keys(el.categories)).toEqual(Object.keys(en.categories));
  });
});
