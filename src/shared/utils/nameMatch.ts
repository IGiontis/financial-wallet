import { textKey } from "./cleanText";

// ─── Names people type: the same one, or one that looks like it ─────────────
//
// The app's one rule for comparing a name someone types against the names
// already there — payees, categories, goals, bills, incomes, cards. Two tiers:
//
//   • the SAME name: equal once trimmed, inner spaces collapsed, case, accents
//     (τόνοι, διαλυτικά) and final ς folded away — `textKey`, which every
//     other comparison in the app already uses. «Δώρο», «δωρο» and « ΔΩΡΟ »
//     are one name, and a second one is refused.
//   • a SIMILAR name: the same word written in Greeklish («Doro», «dwro»), or
//     one typo away («Δόρο», «Vodafon»). Only ever a suggestion — «Μήπως
//     εννοείς «Δώρο»;» — since it can be wrong, and never a reason to block.
//
// Everything runs on lists already loaded: no read is made to ask.

/** The key two names are the same by. One rule for the whole app: see `textKey`. */
export const nameKey = (name: string): string => textKey(name);

/** True when the two are one name: case, accents, final ς and spacing aside. */
export const sameName = (a: string, b: string): boolean => {
  const key = nameKey(a);
  return key !== "" && key === nameKey(b);
};

// Greek written in Latin letters has no single spelling: ω is "o" or "w", η is
// "i" or "h", θ is "th" or "8", χ is "x", "ch" or "h", ου is "ou" or "u". So
// both alphabets are brought to one rough sound key, and two names whose keys
// match are probably the same word. Rough on purpose — it only ever suggests.

/** Greek pairs that are one sound, before single letters are mapped. */
const GREEK_PAIRS: [RegExp, string][] = [
  [/ου/g, "u"],
  [/αι/g, "e"],
  [/(ει|οι|υι)/g, "i"],
  [/αυ/g, "av"],
  [/ευ/g, "ev"],
  [/μπ/g, "b"],
  [/ντ/g, "d"],
  [/(γκ|γγ)/g, "g"],
];

const GREEK_LETTERS: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "8",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  τ: "t",
  υ: "i",
  φ: "f",
  χ: "x",
  ψ: "ps",
  ω: "o",
};

/** Latin spellings of one Greek sound, in the order they must be read. */
const LATIN_PAIRS: [RegExp, string][] = [
  [/th/g, "8"],
  [/(ch|kh|ks)/g, "x"],
  [/ph/g, "f"],
  [/ou/g, "u"],
  [/ai/g, "e"],
  [/(ei|oi|yi)/g, "i"],
  [/au/g, "av"],
  [/eu/g, "ev"],
  [/mp/g, "b"],
  [/nt/g, "d"],
  [/(gk|gg)/g, "g"],
  [/w/g, "o"],
  [/y/g, "i"],
  [/c/g, "k"],
  // A lone h is η to some and χ to others: dropped, it is one typo from either.
  [/h/g, ""],
];

/**
 * A rough sound key shared by Greek and Greeklish: «Δώρο», «Doro» and «dwro»
 * are all "doro"; «Σκλαβενίτης» and «Sklavenitis» are both "sklavenitis".
 * Letters only — spaces and punctuation are dropped, doubled letters are one.
 */
export function greeklishKey(name: string): string {
  let s = nameKey(name);
  for (const [pattern, to] of GREEK_PAIRS) s = s.replace(pattern, to);
  s = [...s].map((ch) => GREEK_LETTERS[ch] ?? ch).join("");
  for (const [pattern, to] of LATIN_PAIRS) s = s.replace(pattern, to);
  return s.replace(/[^\p{L}\p{N}]/gu, "").replace(/(.)\1+/gu, "$1");
}

/**
 * Whether `a` is at most one typo from `b`: one letter added, dropped, changed,
 * or two neighbours swapped. Linear: never builds the full edit table.
 */
export function oneTypoApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // Changed at i, or i and i+1 swapped.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  // One extra letter in the longer one, at i.
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Below this, one typo turns one short word into another («Lidl», «Lida» are fine; «ΔΕΗ», «ΔΕΣ» are not). */
const TYPO_MIN_LENGTH = 4;

/**
 * Two different names that are probably one: the same in Greeklish, or a typo
 * apart. False for the same name — that is `sameName`, a firmer answer.
 */
export function similarName(a: string, b: string): boolean {
  if (!nameKey(a) || !nameKey(b) || sameName(a, b)) return false;
  const ka = greeklishKey(a);
  const kb = greeklishKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return Math.max(ka.length, kb.length) >= TYPO_MIN_LENGTH && oneTypoApart(ka, kb);
}

export type NameMatch<T> = { kind: "same" | "similar"; item: T; name: string } | null;

/**
 * What a typed name meets in a list: the same name (refuse it, offer the one
 * there), a similar one (suggest it), or nothing. `namesOf` gives every way an
 * item may be written — a built-in category answers to its name in each
 * language. `ignore` is the item being renamed: its own name is never a clash.
 * The first match in list order wins, so callers list the likeliest first.
 */
export function matchName<T>(typed: string, items: readonly T[], namesOf: (item: T) => string[], ignore?: T): NameMatch<T> {
  if (!nameKey(typed)) return null;
  const others = ignore === undefined ? items : items.filter((item) => item !== ignore);
  for (const item of others) {
    const name = namesOf(item).find((n) => sameName(typed, n));
    if (name !== undefined) return { kind: "same", item, name: namesOf(item)[0] ?? name };
  }
  // Greeklish first, then typos: the closer reading wins.
  const typedKey = greeklishKey(typed);
  for (const item of others) {
    if (namesOf(item).some((n) => greeklishKey(n) === typedKey && !sameName(typed, n) && typedKey)) return { kind: "similar", item, name: namesOf(item)[0] };
  }
  for (const item of others) {
    if (namesOf(item).some((n) => similarName(typed, n))) return { kind: "similar", item, name: namesOf(item)[0] };
  }
  return null;
}

/** `matchName` over plain strings. */
export const matchNameIn = (typed: string, names: readonly string[], ignore?: string): NameMatch<string> =>
  matchName(
    typed,
    ignore === undefined ? names : names.filter((n) => !sameName(n, ignore)),
    (n) => [n],
  );

/**
 * Pairs in one list that look like one name written two ways — what the
 * «Δικαιούχοι & κατηγορίες» page offers to merge. Each pair once, in list order.
 * `canPair` narrows it further (a category pairs only within its side).
 */
export function similarPairs<T>(items: readonly T[], namesOf: (item: T) => string[], canPair: (a: T, b: T) => boolean = () => true): [T, T][] {
  const keys = items.map((item) => namesOf(item).map((n) => ({ name: n, key: nameKey(n), sound: greeklishKey(n) })));
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!canPair(items[i], items[j])) continue;
      const hit = keys[i].some((a) =>
        keys[j].some((b) => a.key !== "" && b.key !== "" && (a.key === b.key || (a.sound !== "" && a.sound === b.sound) || (Math.max(a.sound.length, b.sound.length) >= TYPO_MIN_LENGTH && oneTypoApart(a.sound, b.sound)))),
      );
      if (hit) pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}
