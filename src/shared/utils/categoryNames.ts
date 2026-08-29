import type { Category, TransactionType } from "../types/IndexTypes";
import en from "../../i18n/locales/en.json";
import el from "../../i18n/locales/el.json";
import { CATEGORY_KEYS } from "./categories";

// ─── Comparing category names ────────────────────────────────────────────────
// A user typing a new category has no idea what already exists under a slightly
// different spelling. "ΕΝΟΙΚΙΟ", "Ενοίκιο", "ενοικιο" and "Rent" are one
// category as far as anyone reading a list is concerned, and ending up with
// four of them makes every total and filter quietly wrong.

/** Combining diacritics — Greek tonos and Latin accents alike, once decomposed. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Case-, accent- and spacing-insensitive key for a category name.
 *
 * Decomposing first is what lets one rule cover both alphabets: NFD splits
 * "ό" into "ο" plus a combining tonos, which the range above strips, so Greek
 * accents and Latin diacritics fall away together. Final sigma is folded
 * separately — it is a distinct letter rather than an accented one, and
 * "Φως"/"φωσ" would otherwise read as two different words.
 */
export function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every locale's translation table, for matching a name across languages. */
const TRANSLATIONS: Record<string, string>[] = [en.categories, el.categories];

/**
 * All the ways one category can legitimately be written: its stored name plus
 * its label in every language the app ships.
 *
 * Without this, a Greek-speaking user typing "Ενοίκιο" would create a second
 * category alongside the seeded "Rent" they have been reading as "Ενοίκιο" all
 * along — the duplicate the check exists to prevent, in the one form a plain
 * string comparison cannot see.
 */
export function categoryAliases(name: string): string[] {
  const key = CATEGORY_KEYS[name];
  if (!key) return [name];
  return [name, ...TRANSLATIONS.map((table) => table[key]).filter(Boolean)];
}

/**
 * The existing category `name` would collide with, or undefined when it is
 * genuinely new. Type-scoped: an "Investments" expense and an "Investments"
 * income are two different things and both are legitimate.
 */
export function findDuplicateCategory(name: string, type: TransactionType, existing: Category[]): Category | undefined {
  const candidate = normalizeCategoryName(name);
  if (!candidate) return undefined;

  return existing.find((c) => c.type === type && categoryAliases(c.name).some((alias) => normalizeCategoryName(alias) === candidate));
}

/** Trimmed and collapsed, but with the user's own capitalisation preserved. */
export const cleanCategoryName = (name: string): string => name.replace(/\s+/g, " ").trim();

// ─── Categories that work both ways ──────────────────────────────────────────
// Betting is money out most weeks and money in occasionally; so are taxes, side
// work and a loan you both pay and receive. Such a category is stored as two
// documents sharing a name — one per type — because every form filters to the
// type it is recording. `CategoryGroup` puts them back together for the one
// screen that lists categories as things rather than as options, where two rows
// with the same name would read as the duplicate we go to lengths to prevent.

/**
 * Deliberately NOT `TransactionType | "both"`: that union also carries
 * "investment", which is a flag on a transaction rather than a kind of
 * category anyone picks from a list. Only these three are choosable.
 */
export type CategoryScope = "expense" | "income" | "both";

export const scopeTypes = (scope: CategoryScope): TransactionType[] => (scope === "both" ? ["expense", "income"] : [scope]);

export interface CategoryGroup {
  /** Shared display name, taken from the first document of the pair. */
  name: string;
  icon?: string;
  scope: CategoryScope;
  /** Every document behind this one row — one, or a matched pair. */
  members: Category[];
}

/**
 * One entry per category the user thinks they have, rather than per document.
 *
 * Grouped on the normalised name so a pair typed at different times still
 * reunites, and only when both types are present — two expense categories that
 * merely normalise alike are a duplicate, not a "both".
 */
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const byKey = new Map<string, Category[]>();
  for (const category of categories) {
    const key = normalizeCategoryName(category.name);
    byKey.set(key, [...(byKey.get(key) ?? []), category]);
  }

  return Array.from(byKey.values())
    .map((members) => {
      const types = new Set(members.map((m) => m.type));
      return {
        name: members[0].name,
        icon: members[0].icon,
        scope: (types.has("expense") && types.has("income") ? "both" : members[0].type) as CategoryScope,
        members,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Existing categories a new one under `scope` would collide with — checked
 * across every type it would occupy, so "both" is refused when either half
 * already exists rather than quietly creating one document of the two.
 */
export function findScopeDuplicates(name: string, scope: CategoryScope, existing: Category[]): Category[] {
  return scopeTypes(scope)
    .map((type) => findDuplicateCategory(name, type, existing))
    .filter((c): c is Category => !!c);
}
// ─── Icons ───────────────────────────────────────────────────────────────────

/**
 * The first user-perceived character of a string, or "" when there is none.
 *
 * Naive slicing breaks emoji: "👍".length is 2, and a family or a flag runs to
 * seven or more code units joined by zero-width joiners — cutting at any of
 * them leaves a fragment that renders as separate people, or as nothing.
 * `Intl.Segmenter` knows where the real boundaries are; `Array.from` at least
 * splits on code points rather than UTF-16 units where it is unavailable.
 */
export function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const [first] = segmenter.segment(trimmed);
    return first?.segment ?? "";
  }

  return Array.from(trimmed)[0] ?? "";
}
