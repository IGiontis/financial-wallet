import { oneOffDate, type BudgetLine, type OneOff } from "./plannerUtils";
import type { OccurrenceOverride, ResolvedOccurrence } from "./plannerActuals";
import { toISODay } from "../../shared/utils/dates";

// ─── What the planner keeps, and how it is read back ─────────────────────────
//
// The planner's own figures live on the user document (see
// `useWorkspaceSetting`), and two screens now read them: the Planner, and the
// Overview, which answers "will I make it to pay day?" from the same plan. Both
// go through here, so the two cannot end up reading different keys or trusting
// different things — a line the Planner drops as malformed must not still count
// on the Overview.
//
// None of this is trusted on its type alone. A value written by an older
// version of the page can still be sitting there: one stale horizon name, or a
// one-off with a bad date, was once enough to take the whole page down.

export const PLANNER_KEYS = {
  horizon: "planner-horizon",
  opening: "planner-opening",
  openingSource: "planner-opening-source",
  lines: "planner-lines",
  oneOffs: "planner-oneoffs",
  skip: "planner-skip",
  occurrences: "planner-occurrences",
} as const;

export function cleanLines(stored: unknown): BudgetLine[] {
  return Array.isArray(stored) ? stored.filter((l): l is BudgetLine => !!l && typeof l.id === "string" && Number.isFinite(l.amount)) : [];
}

/** A bad date here reached `addMonths` as NaN once and took the whole page down with it. */
export function cleanOneOffs(stored: unknown): OneOff[] {
  return Array.isArray(stored)
    ? stored.filter((o): o is OneOff => !!o && typeof o.id === "string" && typeof o.date === "string" && Number.isFinite(o.amount) && o.amount > 0 && !!oneOffDate(o.date))
    : [];
}

export function cleanSkipped(stored: unknown): string[] {
  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === "string") : [];
}

export function cleanOverrides(stored: unknown): Record<string, OccurrenceOverride> {
  return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, OccurrenceOverride>) : {};
}

/**
 * The overrides with one set or cleared — and words about occurrences long gone
 * dropped on the way, so the map never grows past the handful that can still
 * matter. Keys end in the occurrence's expected day (`…:YYYY-MM-DD`).
 */
export function withOverride(previous: unknown, key: string, value: OccurrenceOverride | undefined, now: Date): Record<string, OccurrenceOverride> {
  const next: Record<string, OccurrenceOverride> = {};
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 120);
  for (const [k, v] of Object.entries(cleanOverrides(previous))) {
    const day = new Date(`${k.slice(-10)}T00:00:00`);
    if (Number.isNaN(day.getTime()) || day >= cutoff) next[k] = v;
  }
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

/**
 * The two answers to "it was not found — has it come already?", as the
 * overrides they are stored as.
 *
 * "It came" is recorded exactly as the occurrence sheet records it: today, for
 * the amount expected. "Not yet" is the sheet's "keep waiting", which tells the
 * plan to stop second-guessing and count it on its day again. Both are
 * overrides, so the question is not asked a second time — and the Planner and
 * the Overview, which both ask it, cannot record the answer differently.
 */
export function answerUnconfirmed(occurrence: Pick<ResolvedOccurrence, "amount" | "plannedAmount">, arrived: boolean, today: Date = new Date()): OccurrenceOverride {
  return arrived ? { state: "received", date: toISODay(today), amount: Math.abs(occurrence.plannedAmount || occurrence.amount) } : { state: "waiting" };
}
