// The user-document keys of «Δουλειά», on their own with no imports: the
// demo's account (`demo/fixtures`) sets them, and must not load the data layer
// to learn their names.

/** On or off, per account — read through `useHasAccess("business")`. */
export const BUSINESS_ON_KEY = "business-on";

/**
 * The user's businesses (`Business[]`), each with its own income and expense
 * lines — all made by the user, from nothing: no presets, no starting lines.
 */
export const BUSINESSES_KEY = "businesses";

/** The most businesses one account keeps, and the most lines of each kind one business offers. */
export const BUSINESSES_MAX = 20;
export const LINES_MAX = 30;
