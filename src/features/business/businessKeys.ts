// The user-document keys of «Δουλειά», on their own with no imports: the
// demo's account (`demo/fixtures`) sets them, and must not load the data layer
// to learn their names.

/** On or off, per account — read through `useHasAccess("business")`. */
export const BUSINESS_ON_KEY = "business-on";

/** The business's own categories (`BusinessCategory[]`). */
export const BUSINESS_CATEGORIES_KEY = "business-categories";

/**
 * The four expense categories every account starts with, made the first time
 * the page is switched on (Settings): the ones the owner's business user asked
 * for. Renamed, added to or deleted on the page's «Κατηγορίες» tab after that.
 */
export const DEFAULT_BUSINESS_CATEGORIES = {
  el: [
    { id: "bcat-transport", name: "Μεταφορικά" },
    { id: "bcat-operating", name: "Λειτουργικά έξοδα" },
    { id: "bcat-goods", name: "Εμπορεύματα" },
    { id: "bcat-taxes", name: "Εφορία + ΕΦΚΑ" },
  ],
  en: [
    { id: "bcat-transport", name: "Transport" },
    { id: "bcat-operating", name: "Operating costs" },
    { id: "bcat-goods", name: "Goods & stock" },
    { id: "bcat-taxes", name: "Taxes & social insurance" },
  ],
} as const;

/** The starting four, in the reader's language. */
export const defaultBusinessCategories = (lang: string | undefined): { id: string; name: string }[] =>
  DEFAULT_BUSINESS_CATEGORIES[lang?.startsWith("el") ? "el" : "en"].map((c) => ({ ...c }));
