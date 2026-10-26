import type { MonthBar } from "../components/MonthBars";

/**
 * The months with the most and the ones with the least — every month tied at
 * each end, since naming October alone when nine months bring the same is
 * wrong. Nothing at an end that most months share (it is the usual month, not
 * one that stands out), and nothing at all on a flat run. `threshold` asks for
 * more: the most at least that far above the average, the least that far below
 * it, so only a month that really stands out is named.
 */
export function monthExtremes<T extends MonthBar>(months: T[], threshold = 0): { highs: T[]; lows: T[] } {
  const total = months.reduce((sum, m) => sum + m.total, 0);
  if (total <= 0 || months.length === 0) return { highs: [], lows: [] };
  const average = total / months.length;
  const max = Math.max(...months.map((m) => m.total));
  const min = Math.min(...months.map((m) => m.total));
  if (max === min) return { highs: [], lows: [] };
  const few = (list: T[]) => (list.length <= months.length / 2 ? list : []);
  return {
    highs: max > average * (1 + threshold) ? few(months.filter((m) => m.total === max)) : [],
    lows: min < average * (1 - threshold) ? few(months.filter((m) => m.total === min)) : [],
  };
}
