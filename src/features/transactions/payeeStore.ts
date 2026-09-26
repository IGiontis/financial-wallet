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

// ─── Suggestions from what was actually entered ─────────────────────────────
// A long saved list is fine to search and slow to scroll, and on a phone the
// keyboard covers most of it. Most entries go to the same handful of payees,
// and the transactions already say which — no extra read, no setup.

interface PayeeUse {
  description: string;
  categoryId?: string;
  date: Date | { toDate(): Date } | string | number;
}

const when = (value: PayeeUse["date"]): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value && "toDate" in value) return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};

/**
 * The payees used most with a category, most used first, ties to the most
 * recent. With no category chosen, across everything. Each is spelled the way
 * it was last typed, and one-off blanks are skipped.
 */
export function frequentPayees(transactions: PayeeUse[], categoryId?: string, limit = 5): string[] {
  const counts = new Map<string, { name: string; count: number; last: number }>();
  for (const tx of transactions) {
    const name = tx.description?.trim();
    if (!name || (categoryId && tx.categoryId !== categoryId)) continue;
    const key = payeeKey(name);
    const at = when(tx.date);
    const entry = counts.get(key);
    if (!entry) counts.set(key, { name, count: 1, last: at });
    else {
      entry.count += 1;
      if (at >= entry.last) {
        entry.last = at;
        entry.name = name;
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((e) => e.name);
}

/** The last few distinct payees, newest first. */
export function recentPayees(transactions: PayeeUse[], limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tx of [...transactions].sort((a, b) => when(b.date) - when(a.date))) {
    const name = tx.description?.trim();
    if (!name || seen.has(payeeKey(name))) continue;
    seen.add(payeeKey(name));
    out.push(name);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * The list under letter headings, the way a phone's contacts read. Accents are
 * dropped for the heading only, so "Ά" files under "Α"; anything not a letter
 * goes under "#", last. Greek letters come before Latin ones, as in a Greek
 * phone's contacts — otherwise the Latin "A" and the Greek "Α", which look the
 * same, would be two headings with other letters between them.
 */
export function payeesByInitial(payees: string[]): { letter: string; names: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const name of sortPayees(payees)) {
    const first = name.trim().charAt(0).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleUpperCase();
    const letter = /\p{L}/u.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), name]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const rank = (l: string) => (l === "#" ? 2 : /\p{Script=Greek}/u.test(l) ? 0 : 1);
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .map(([letter, names]) => ({ letter, names }));
}
