import { cleanLine } from "../../shared/utils/cleanText";
import { sameName } from "../../shared/utils/nameMatch";
import type { Business, BusinessLine } from "../../shared/types/IndexTypes";

// ─── A business, as the form leaves it ───────────────────────────────────────
//
// The form edits two lists of names — the income lines and the expense lines —
// and this turns them into the business stored on the user document:
//
// - a line kept (renamed or not) keeps its id, so every closing that names it
//   reads the new name with no write to any closing;
// - a new line gets a new id — unless it is the name of a line taken off the
//   business earlier (`removed`), which comes back under its old id, so its old
//   closings and its new ones add up together;
// - a line taken off that closings still name stays, marked `removed`: no
//   longer offered in a new closing, but those closings still say what it was.
//   One no closing names simply goes. While the closings are not on the device
//   (`usesKnown` false) nothing is dropped, only marked.

export interface LineDraft {
  /** The stored line this row edits; absent for a new one. */
  id?: string;
  name: string;
}

/** The rows that carry a name, cleaned. */
export const filledLines = (drafts: readonly LineDraft[]) => drafts.map((d) => ({ ...d, name: cleanLine(d.name) })).filter((d) => d.name !== "");

/** The rows that clash with an earlier row of the same list (same name, ignoring case, accents and spaces). */
export function clashingRows(drafts: readonly LineDraft[]): Set<number> {
  const clash = new Set<number>();
  drafts.forEach((d, i) => {
    const name = cleanLine(d.name);
    if (name && drafts.slice(0, i).some((earlier) => sameName(cleanLine(earlier.name), name))) clash.add(i);
  });
  return clash;
}

/**
 * A business always keeps at least one income line (DECISIONS, 2026-11-12):
 * a day can bring in 0 €, but there is always a line to say so. Expense lines
 * may be none at all.
 */
export const INCOME_LINES_MIN = 1;

/**
 * Whether one list of line names can be saved: at least `least` named rows, at
 * most `max`, no name twice, none longer than `nameMax`. Empty rows don't count
 * — they are dropped at save.
 */
export function linesReady(drafts: readonly LineDraft[], least: number, max: number, nameMax: number): boolean {
  const filled = filledLines(drafts);
  return filled.length >= least && filled.length <= max && clashingRows(drafts).size === 0 && filled.every((r) => r.name.length <= nameMax);
}

/** The stored lines this form takes off the business, with how many closings name each. */
export function removedLines(stored: readonly BusinessLine[], drafts: readonly LineDraft[], uses: ReadonlyMap<string, number>): { line: BusinessLine; uses: number }[] {
  const kept = new Set(drafts.filter((d) => d.id && cleanLine(d.name)).map((d) => d.id));
  return stored.filter((l) => !l.removed && !kept.has(l.id)).map((line) => ({ line, uses: uses.get(line.id) ?? 0 }));
}

function buildLines(stored: readonly BusinessLine[], drafts: readonly LineDraft[], uses: ReadonlyMap<string, number>, usesKnown: boolean, newId: () => string): BusinessLine[] {
  const filled = filledLines(drafts);
  const keptIds = new Set(filled.map((d) => d.id).filter(Boolean));
  const revived = new Set<string>();
  const active: BusinessLine[] = filled.map((d) => {
    if (d.id && stored.some((l) => l.id === d.id)) return { id: d.id, name: d.name };
    const back = stored.find((l) => l.removed && !revived.has(l.id) && !keptIds.has(l.id) && sameName(l.name, d.name));
    if (back) {
      revived.add(back.id);
      return { id: back.id, name: d.name };
    }
    return { id: newId(), name: d.name };
  });
  const activeIds = new Set(active.map((l) => l.id));
  const kept = stored
    .filter((l) => !activeIds.has(l.id))
    .filter((l) => !usesKnown || (uses.get(l.id) ?? 0) > 0)
    .map((l) => ({ id: l.id, name: l.name, removed: true as const }));
  return [...active, ...kept];
}

/** The business as the form leaves it. `previous` is the stored one when editing. */
export function buildBusiness(
  previous: Business | undefined,
  input: { id: string; name: string; incomes: readonly LineDraft[]; expenses: readonly LineDraft[] },
  uses: ReadonlyMap<string, number>,
  usesKnown: boolean,
  newId: () => string,
): Business {
  return {
    id: input.id,
    name: cleanLine(input.name),
    incomeLines: buildLines(previous?.incomeLines ?? [], input.incomes, uses, usesKnown, newId),
    expenseLines: buildLines(previous?.expenseLines ?? [], input.expenses, uses, usesKnown, newId),
  };
}

const isLine = (value: unknown): value is BusinessLine => {
  const l = value as BusinessLine;
  return !!l && typeof l.id === "string" && typeof l.name === "string";
};
const linesOf = (value: unknown): BusinessLine[] => (Array.isArray(value) ? value.filter(isLine).map((l) => ({ id: l.id, name: l.name, ...(l.removed ? { removed: true } : {}) })) : []);

/** What the user document holds, read defensively: anything malformed is left out, never shown half. */
export function readBusinesses(stored: unknown): Business[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((b): b is Business => !!b && typeof (b as Business).id === "string" && typeof (b as Business).name === "string")
    .map((b) => ({ id: b.id, name: b.name, incomeLines: linesOf(b.incomeLines), expenseLines: linesOf(b.expenseLines) }));
}
