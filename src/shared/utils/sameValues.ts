import { cleanText } from "./cleanText";
import { toISODay } from "./dates";

/**
 * «Did anything really change?» — the one comparison behind «No change, no
 * Save» (`.claude/rules/ui.md`; the owner, 2026-11-16: edit forms let him press
 * Save with nothing changed).
 *
 * Two values are the same when what they MEAN is the same, not when their
 * JavaScript happens to match:
 *   • text: trimmed, runs of spaces folded (line breaks in a note kept) —
 *     «Σούπερ » is «Σούπερ», «Σούπερ  μάρκετ» is «Σούπερ μάρκετ»;
 *   • numbers as numbers: 50, 50.00 and "50" / "50,00" against a number are one
 *     figure (a few billionths apart counts as equal: 0.1 + 0.2 is 0.3);
 *   • dates as calendar days, in local time: a Date, a Firestore Timestamp and
 *     "2026-11-16" are the same day whatever the hour;
 *   • empty is absent: "", "  ", null, undefined, NaN, [] and {} all mean «not
 *     given», so an optional note left empty equals one never stored;
 *   • lists by content, in order (order means something — a goal's parts are
 *     filled in order); a list whose order does not matter is sorted by the
 *     caller (`asSet`);
 *   • objects by their fields, so two copies of a record with the same ids and
 *     figures are the same — never by object identity.
 *
 * Two strings are compared as text, never as numbers: a code «007» is not «7».
 * A form whose numeric field is typed as text says so with `asNumber`.
 */

/** Below this, two numbers are one figure (float noise, not a cent). */
const EPSILON = 1e-9;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const NUMERIC_TEXT = /^[-+]?\d+(?:[.,]\d+)?$/;

const isTimestamp = (v: object): boolean =>
  typeof (v as { toDate?: unknown }).toDate === "function" ||
  (typeof (v as { seconds?: unknown }).seconds === "number" && typeof (v as { nanoseconds?: unknown }).nanoseconds === "number" && Object.keys(v).length <= 2);

/** A day marker no typed text can be confused with. */
const day = (value: unknown) => ({ __day: toISODay(value) });

/** Text that is a number, read as one: "50", "50,00", "-3.5". Undefined otherwise. */
export function numberFromText(text: string): number | undefined {
  const s = text.trim();
  if (!NUMERIC_TEXT.test(s)) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** For a field typed as text that holds a number: "50,00" → 50, "" → absent. */
export const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return numberFromText(value);
  return undefined;
};

/** For a list whose order means nothing (picked ids, tags): compared as a set. */
export const asSet = <T,>(list: readonly T[] | undefined | null): string[] => (list ?? []).map((item) => JSON.stringify(canonical(item))).sort();

/**
 * The value as it is compared: `undefined` for «not given», text cleaned,
 * dates as `{ __day }`, objects with their empty fields dropped. Exported for
 * tests and for a caller that keys something by it.
 */
export function canonical(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isNaN(value) ? undefined : value === 0 ? 0 : value;
  if (typeof value === "string") {
    const text = cleanText(value);
    if (text === "") return undefined;
    if (ISO_DAY.test(text)) return { __day: text };
    if (ISO_INSTANT.test(text)) {
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? text : day(date);
    }
    return text;
  }
  if (typeof value === "boolean" || typeof value === "bigint") return value;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : day(value);
  if (isTimestamp(value)) return day(value);
  if (Array.isArray(value)) {
    const items = value.map(canonical);
    return items.length === 0 ? undefined : items;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = canonical((value as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function equalCanonical(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  // A number against text that is a number: one figure («50» typed, 50 stored).
  if (typeof a === "number" || typeof b === "number") {
    const x = typeof a === "number" ? a : typeof a === "string" ? numberFromText(a) : undefined;
    const y = typeof b === "number" ? b : typeof b === "string" ? numberFromText(b) : undefined;
    if (x === undefined || y === undefined) return false;
    return Math.abs(x - y) <= EPSILON * Math.max(1, Math.abs(x), Math.abs(y));
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => equalCanonical(item, b[i]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in (b as object) && equalCanonical((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** True when `a` and `b` mean the same (see the rules above). */
export function sameValues(a: unknown, b: unknown): boolean {
  return equalCanonical(canonical(a), canonical(b));
}

/**
 * The data layer's net under «No change, no Save»: true when every field an
 * update would write already holds that value in the stored record. Only the
 * update's own fields are looked at — the record's others are not being
 * touched. A field set to `null` / `undefined` / "" (cleared) matches one the
 * record does not have. Without a stored record (not in the cache) it answers
 * false: never skip a write it cannot prove is empty.
 */
export function sameAsStored(stored: object | null | undefined, update: object | null | undefined): boolean {
  if (!stored || !update) return false;
  return Object.entries(update).every(([key, value]) => sameValues((stored as Record<string, unknown>)[key], value));
}
