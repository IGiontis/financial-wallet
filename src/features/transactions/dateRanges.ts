// The quick ranges the phone's date filter offers, and the month it steps
// through. Pure, so the filter's buttons and their tests share one meaning of
// "this month" or "three months".

export type RangePreset = "thisMonth" | "lastMonth" | "threeMonths" | "thisYear" | "all";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const lastOfMonth = (year: number, month: number) => new Date(year, month + 1, 0);

/**
 * A whole calendar month — but never past today: "October" read on the 7th is
 * the 1st to the 7th, which is what there is to see.
 */
export function monthRange(year: number, month: number, now: Date): DateRange {
  const from = new Date(year, month, 1);
  const end = lastOfMonth(from.getFullYear(), from.getMonth());
  return { from, to: end > day(now) && from <= day(now) ? day(now) : end };
}

export function presetRange(preset: RangePreset, now: Date): DateRange {
  const today = day(now);
  switch (preset) {
    case "thisMonth":
      return monthRange(now.getFullYear(), now.getMonth(), now);
    case "lastMonth":
      return monthRange(now.getFullYear(), now.getMonth() - 1, now);
    // This month and the two before it, in full.
    case "threeMonths":
      return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: today };
    case "thisYear":
      return { from: new Date(now.getFullYear(), 0, 1), to: today };
    case "all":
      return { from: null, to: null };
  }
}

const same = (a: Date | null, b: Date | null) => (a && b ? day(a).getTime() === day(b).getTime() : a === b);

/** Which preset a range is, if it is one — so its chip shows as chosen. */
export function matchPreset(range: DateRange, now: Date): RangePreset | undefined {
  const presets: RangePreset[] = ["thisMonth", "lastMonth", "threeMonths", "thisYear", "all"];
  return presets.find((preset) => {
    const p = presetRange(preset, now);
    return same(p.from, range.from) && same(p.to, range.to);
  });
}

/** The month a range is exactly, as the stepper reads it — or undefined for any other span. */
export function rangeMonth(range: DateRange, now: Date): { year: number; month: number } | undefined {
  if (!range.from || !range.to || range.from.getDate() !== 1) return undefined;
  const m = monthRange(range.from.getFullYear(), range.from.getMonth(), now);
  return same(m.to, range.to) ? { year: range.from.getFullYear(), month: range.from.getMonth() } : undefined;
}

/**
 * The month one step from the range: from a month, the one before or after;
 * from any other span, the month its end falls in, then on from there. Never
 * into the future past this month.
 */
export function stepMonth(range: DateRange, direction: -1 | 1, now: Date): DateRange | undefined {
  const current = rangeMonth(range, now);
  const anchor = current ?? (range.to ? { year: range.to.getFullYear(), month: range.to.getMonth() } : { year: now.getFullYear(), month: now.getMonth() });
  const target = new Date(anchor.year, anchor.month + (current ? direction : direction < 0 ? 0 : direction), 1);
  if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return undefined;
  return monthRange(target.getFullYear(), target.getMonth(), now);
}
