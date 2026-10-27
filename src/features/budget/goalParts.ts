import type { GoalPart } from "../../shared/types/IndexTypes";

// A goal built from parts: «Σπίτι 150–200, Lift 50–90, Μεταφορικά 100–200,
// Φαγητό 150–200» instead of one figure nobody really knows. The target is the
// parts' «έως» added up (690), so the goal is never short; their «από» (450)
// is the point where the trip is possible at all. Money put in fills every
// part up to its «από» first, in the order they were written, and only then
// each up to its «έως" — the essentials before the comforts.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A part as it is being typed: figures as the inputs hold them. */
export interface GoalPartDraft {
  id: string;
  label: string;
  min: string;
  max: string;
}

export const newPartDraft = (): GoalPartDraft => ({ id: `part-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label: "", min: "", max: "" });

export const partDraftsOf = (parts: GoalPart[] | undefined): GoalPartDraft[] =>
  parts?.length ? parts.map((p) => ({ id: p.id, label: p.label, min: String(p.min), max: String(p.max) })) : [newPartDraft()];

const num = (raw: string) => {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The parts worth keeping: a name and an «έως» above zero. An «από» left empty
 * is the «έως» (one figure, not a range); one above the «έως» is taken down to it.
 */
export function partsFromDrafts(drafts: GoalPartDraft[]): GoalPart[] {
  return drafts.flatMap((d) => {
    const label = d.label.trim();
    const max = num(d.max);
    if (!label || !(max > 0)) return [];
    const min = num(d.min);
    return [{ id: d.id, label, min: round2(Number.isFinite(min) && min >= 0 ? Math.min(min, max) : max), max: round2(max) }];
  });
}

/** A row half written — a name without an «έως», or an «έως» without a name — or an «από» above its «έως». */
export function draftProblem(d: GoalPartDraft): "missing" | "minAboveMax" | undefined {
  const written = d.label.trim() !== "" || d.min.trim() !== "" || d.max.trim() !== "";
  if (!written) return undefined;
  if (!d.label.trim() || !(num(d.max) > 0)) return "missing";
  if (num(d.min) > num(d.max)) return "minAboveMax";
  return undefined;
}

/** What the parts add up to, at their least and their most. */
export function partsTotals(parts: GoalPart[]): { min: number; max: number } {
  return { min: round2(parts.reduce((sum, p) => sum + p.min, 0)), max: round2(parts.reduce((sum, p) => sum + p.max, 0)) };
}

export interface PartFill {
  part: GoalPart;
  /** What of the money in the goal is counted towards this part. */
  filled: number;
  /** It has reached its «από». */
  reachedMin: boolean;
  /** It has reached its «έως». */
  full: boolean;
}

/**
 * What `saved` covers of each part: every part up to its «από», in order, then
 * every part up to its «έως», in order. Anything beyond the «έως» total is in
 * the goal but in no part.
 */
export function fillParts(parts: GoalPart[], saved: number): PartFill[] {
  let left = Math.max(saved, 0);
  const filled = parts.map((p) => {
    const take = Math.min(left, p.min);
    left = round2(left - take);
    return take;
  });
  parts.forEach((p, i) => {
    const take = Math.min(left, p.max - filled[i]);
    filled[i] = round2(filled[i] + take);
    left = round2(left - take);
  });
  return parts.map((part, i) => ({ part, filled: filled[i], reachedMin: filled[i] >= part.min - 0.005, full: filled[i] >= part.max - 0.005 }));
}
