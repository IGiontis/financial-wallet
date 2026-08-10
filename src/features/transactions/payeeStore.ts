// The payee list the user maintains by hand: add, rename, delete. Kept as a
// plain ordered array of names so it can live on the user document — a list
// this small doesn't justify its own Firestore collection, and riding along on
// a document the app already reads means the picker costs nothing to load.

/** Case- and whitespace-insensitive identity, so "Shell" and " shell " are one payee. */
export const payeeKey = (name: string): string => name.trim().toLowerCase();

export const MAX_PAYEE_LENGTH = 30;

export type PayeeError = "empty" | "duplicate" | "tooLong";

/**
 * Validates a name for adding or renaming. `ignore` is the entry being renamed,
 * so leaving its own name untouched isn't reported as a duplicate.
 */
export function validatePayee(payees: string[], name: string, ignore?: string): PayeeError | undefined {
  const label = name.trim();
  if (!label) return "empty";
  if (label.length > MAX_PAYEE_LENGTH) return "tooLong";

  const key = payeeKey(label);
  const ignoreKey = ignore ? payeeKey(ignore) : undefined;
  if (key === ignoreKey) return undefined;

  return payees.some((p) => payeeKey(p) === key) ? "duplicate" : undefined;
}

/** Appends a payee. Returns the list unchanged when the name isn't usable. */
export function addPayee(payees: string[], name: string): string[] {
  if (validatePayee(payees, name)) return payees;
  return [...payees, name.trim()];
}

/** Renames in place, keeping the entry's position in the list. */
export function renamePayee(payees: string[], from: string, to: string): string[] {
  if (validatePayee(payees, to, from)) return payees;

  const fromKey = payeeKey(from);
  const label = to.trim();
  return payees.map((p) => (payeeKey(p) === fromKey ? label : p));
}

export function removePayee(payees: string[], name: string): string[] {
  const key = payeeKey(name);
  return payees.filter((p) => payeeKey(p) !== key);
}

/** Alphabetical, case-insensitive — a hand-kept list reads best sorted. */
export function sortPayees(payees: string[]): string[] {
  return [...payees].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Narrows the list to what is typed. A prefix match outranks a match in the
 * middle, so typing "sh" puts "Shell" above "Fresh Market". An empty query
 * returns everything.
 */
export function filterPayees(payees: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return payees;

  return payees
    .map((name, index) => ({ name, at: name.toLowerCase().indexOf(q), index }))
    .filter((r) => r.at !== -1)
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.index - b.index)
    .map((r) => r.name);
}

/** True when the typed text matches nothing saved — the form will use it as-is. */
export function isUnsavedPayee(payees: string[], query: string): boolean {
  const q = payeeKey(query);
  if (!q) return false;
  return !payees.some((p) => payeeKey(p) === q);
}
