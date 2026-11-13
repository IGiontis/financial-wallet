import { textKey } from "../../shared/utils/cleanText";
import type { TFunction } from "i18next";
import { BUSINESS_CATEGORY_ID, VIRTUAL_CATEGORIES, categoryLabel } from "../../shared/utils/categories";
import type { Transaction } from "../../shared/types/IndexTypes";

// ─── Finding records: the category filter and the search ─────────────────────
//
// One rule for every screen that filters or searches records (the
// Transactions list, the «Βιβλίο κινήσεων»):
//
//   • The category filter offers the user's own categories, one per name, and
//     the categories with no document behind them (`VIRTUAL_CATEGORIES`:
//     «Δουλειά», «Μεταφορά», «Δάνεια», «Τόκοι δανείου») — but only those some
//     record was actually written under, so nobody picks a page of nothing.
//     None of them is ever offered in a form for a NEW record: only the
//     business page, a transfer or a debt writes them.
//   • The search looks at what the row shows, not only its description: the
//     category's name in either language, and, for a business closing's
//     record, the business's current name and «Κέρδος»/«Ζημιά» («Profit» /
//     «Loss»). Case, accents and spacing aside («δουλεια» finds «Δουλειά»).

type CategoryLike = { id: string; name: string; icon?: string };

/** One choice of the category filter: a name, and every category id behind it. */
export interface CategoryChoice {
  /** What the filter keeps: a user category's stored name, or a virtual category's id. */
  value: string;
  /** The stored name (English for defaults and virtual ones) — shown through `categoryLabel`. */
  name: string;
  icon?: string;
  /** One name can be an income and an expense category: both are picked as one. */
  ids: string[];
}

export interface CategoryChoiceOptions {
  /** How a name is shown — `categoryLabel(name, t)`; the list is sorted by it. */
  label: (name: string) => string;
  /** Only the user's categories some record was written in (the ledger); the virtual ones always are. */
  onlyUsed?: boolean;
}

/** The categories a reader can filter records by — see the header. */
export function categoryChoices(categories: readonly CategoryLike[], transactions: readonly Pick<Transaction, "categoryId">[], { label, onlyUsed = false }: CategoryChoiceOptions): CategoryChoice[] {
  const used = new Set(transactions.map((tx) => tx.categoryId));
  const byName = new Map<string, CategoryChoice>();
  for (const c of categories) {
    if (VIRTUAL_CATEGORIES[c.id]) continue;
    if (onlyUsed && !used.has(c.id)) continue;
    // By the name the reader sees: «Άλλο» income and «Άλλο» expense are one choice.
    const key = label(c.name);
    const choice = byName.get(key) ?? { value: c.name, name: c.name, icon: c.icon, ids: [] };
    choice.ids.push(c.id);
    byName.set(key, choice);
  }
  const virtual = Object.values(VIRTUAL_CATEGORIES)
    .filter((v) => used.has(v.id))
    .map((v) => ({ value: v.id, name: v.name, icon: v.icon, ids: [v.id] }));
  return [...byName.values(), ...virtual].sort((a, b) => label(a.name).localeCompare(label(b.name)));
}

/** Every name a record answers to in the search, in any language. */
export interface SearchNames {
  /** A category's stored name and its label in every language. */
  category: (category: CategoryLike) => string[];
  /** A business's name as it is now; undefined once deleted. */
  business: (businessId: string) => string | undefined;
  /** «Κέρδος», «Profit» … */
  profit: readonly string[];
  /** «Ζημιά», «Loss» … */
  loss: readonly string[];
}

/**
 * The names, from one translator per language the app speaks and the
 * businesses on the user document. A category's names are worked out once.
 */
export function buildSearchNames(translators: readonly TFunction[], businesses: readonly { id: string; name: string }[]): SearchNames {
  const labels = new Map<string, string[]>();
  return {
    category: (c) => {
      let names = labels.get(c.name);
      if (!names) {
        names = [c.name, ...translators.map((t) => categoryLabel(c.name, t))];
        labels.set(c.name, names);
      }
      return names;
    },
    business: (id) => businesses.find((b) => b.id === id)?.name,
    profit: translators.map((t) => t("business.profit")),
    loss: translators.map((t) => t("business.loss")),
  };
}

/** All a record answers to, folded by `textKey`, one part per line. */
export function searchText(tx: Transaction, category: CategoryLike | undefined, names: SearchNames): string {
  const parts: string[] = [tx.description ?? ""];
  if (category) parts.push(...names.category(category));
  if (tx.categoryId === BUSINESS_CATEGORY_ID) {
    if (tx.businessId) parts.push(names.business(tx.businessId) ?? "");
    parts.push(...(tx.type === "income" ? names.profit : names.loss));
  }
  return parts.map(textKey).filter(Boolean).join("\n");
}

/** Whether a record is found by `query` — every record when it is blank. */
export function matchesSearch(tx: Transaction, query: string, category: CategoryLike | undefined, names: SearchNames): boolean {
  const needle = textKey(query);
  if (!needle) return true;
  return searchText(tx, category, names).includes(needle);
}
