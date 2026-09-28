import type { ProjectionPoint } from "./plannerUtils";

// The arithmetic behind the balance line's axes, kept apart from the drawing so
// it can be tested without a browser.
//
// One drawing has to serve a month of daily points and ten years of monthly
// ones, on a phone. Everything here exists to keep the long horizons readable
// without making the short ones sparse: round amounts on the side, calendar
// labels that thin themselves out, and dots only where something stands out.

/** A round step — 1, 2, 2.5 or 5 × 10ⁿ — no smaller than `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((step) => step >= raw - 1e-9) ?? 10 * magnitude;
}

export interface ValueScale {
  min: number;
  max: number;
  /** Round amounts to label, zero among them whenever zero is in range. */
  ticks: number[];
}

/**
 * The vertical range and the amounts to label on it.
 *
 * Five steps rather than four: a balance peaking at 2,252 gets steps of 500
 * and a top of 2,500, where four would give 1,000 and 3,000 and leave the upper
 * quarter of a short phone chart empty.
 *
 * The top is rounded up to a whole step; the bottom stops just under the
 * lowest point. Rounding the bottom too would let a €900 dip on a ten-year line
 * whose steps are €20,000 drag the floor to −20k, and a fifth of the height
 * would go on showing nothing.
 */
export function valueScale(values: number[], count = 5): ValueScale {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const step = niceStep((hi - lo) / count);
  // A line flat on zero still needs a range, or every point is the same pixel.
  const max = Math.max(Math.ceil(hi / step) * step, step);
  const min = lo < 0 ? lo - (max - lo) * 0.05 : 0;

  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 100) / 100 || 0);
  return { min, max, ticks };
}

export interface TimeTick {
  time: number;
  label: string;
  x: number;
}

/**
 * Calendar labels for the bottom edge, as many as fit.
 *
 * Years are placed first, then month starts, then (on a daily line) the 8th,
 * 15th and 22nd — each only if it lands at least `gap` pixels from every label
 * already placed. So a month reads in weeks, a year in months, and ten years in
 * every other year, from the one rule.
 */
export function calendarTicks({
  start,
  end,
  daily,
  x,
  left,
  right,
  formatMonth,
  formatDay,
  gap = 46,
}: {
  start: Date;
  end: Date;
  daily: boolean;
  x: (time: number) => number;
  left: number;
  right: number;
  formatMonth: (date: Date) => string;
  formatDay: (date: Date) => string;
  gap?: number;
}): TimeTick[] {
  const candidates: { time: number; label: string; rank: number }[] = [];
  const from = start.getTime();
  const to = end.getTime();

  for (let month = new Date(start.getFullYear(), start.getMonth(), 1); month.getTime() <= to; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    if (month.getTime() > from) {
      const january = month.getMonth() === 0;
      candidates.push({ time: month.getTime(), label: january ? String(month.getFullYear()) : formatMonth(month), rank: january ? 3 : 2 });
    }
    if (daily) {
      for (const day of [8, 15, 22]) {
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        if (date.getTime() > from && date.getTime() <= to) candidates.push({ time: date.getTime(), label: formatDay(date), rank: 1 });
      }
    }
  }

  candidates.sort((a, b) => b.rank - a.rank || a.time - b.time);
  const kept: TimeTick[] = [];
  for (const candidate of candidates) {
    const at = x(candidate.time);
    // Half a label from either edge, or it is clipped.
    if (at < left + 12 || at > right - 12) continue;
    if (kept.every((tick) => Math.abs(tick.x - at) >= gap)) kept.push({ time: candidate.time, label: candidate.label, x: at });
  }
  return kept.sort((a, b) => a.time - b.time);
}

/**
 * Which points get a dot.
 *
 * While only a handful of days carry anything, all of them. Past that — three
 * months of daily points, or any horizon sampled by the month, where every
 * point holds a pay day — a dot on each is a smear, so only what stands out is
 * marked: the lowest point, the highest, the first day under zero, and the
 * steepest drops, no two of those closer than `spacing` pixels.
 */
export function markerIndexes(points: ProjectionPoint[], x: (index: number) => number, { limit = 16, drops = 6, spacing = 18 } = {}): number[] {
  const carrying = points.flatMap((p, i) => (p.events.length > 0 ? [i] : []));
  if (carrying.length <= limit) return carrying;

  let low = 0;
  let high = 0;
  points.forEach((p, i) => {
    if (p.balance < points[low].balance) low = i;
    if (p.balance > points[high].balance) high = i;
  });
  const under = points.findIndex((p) => p.balance < 0);
  const keep = new Set([low, high, ...(under >= 0 ? [under] : [])]);

  const steepest = points
    .map((p, i) => ({ i, drop: i > 0 ? points[i - 1].balance - p.balance : 0 }))
    .filter((d) => d.drop > 0)
    .sort((a, b) => b.drop - a.drop);
  let added = 0;
  for (const { i } of steepest) {
    if (added >= drops) break;
    if ([...keep].every((k) => Math.abs(x(k) - x(i)) >= spacing)) {
      keep.add(i);
      added += 1;
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/** The point closest in time to `time` — what a finger at that spot means. Points are in date order. */
export function nearestIndex(points: ProjectionPoint[], time: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date.getTime() < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].date.getTime() - time) <= Math.abs(points[lo].date.getTime() - time)) return lo - 1;
  return lo;
}
