// Shared chart styling. Deliberately free of recharts imports so the card
// shells and legends can render while the chart bundle is still loading.

/**
 * Six accents, reused from the existing semantic tokens rather than a new
 * palette, so every chart on the page matches the rest of the app. Order is
 * fixed: a category keeps its colour across all nine charts.
 */
export const SERIES_COLORS = [
  "var(--bs-primary)",
  "var(--color-expense)",
  "var(--color-income)",
  "var(--color-invest)",
  "var(--color-goal)",
  "var(--color-text-secondary)",
] as const;

export const seriesColor = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length];

/**
 * Dash pattern for a series, so more lines than colours stay distinguishable.
 *
 * The palette is six semantic tokens and the app deliberately has no others; a
 * seventh line simply reusing the first colour is two indistinguishable lines
 * on the same axis. Cycling the stroke instead gives eighteen combinations out
 * of the same six colours, and reads in greyscale besides.
 */
export const seriesDash = (index: number): string | undefined => {
  const cycle = Math.floor(index / SERIES_COLORS.length);
  return cycle === 0 ? undefined : cycle === 1 ? "5 3" : "1 3";
};

export const AXIS_TICK = { fontSize: 11, fill: "var(--color-text-secondary)" } as const;
export const GRID_STROKE = "var(--color-border-tertiary)";
export const CURSOR_FILL = { fill: "rgba(128,128,128,0.08)", radius: 4 } as const;

/**
 * Short weekday names, Monday first, matching how the app buckets weeks
 * everywhere else. 5 Jan 2026 was a Monday — a fixed anchor beats deriving one
 * from today, which would rotate the labels daily.
 */
export function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 5 + i)).replace(".", ""));
}

/** 1200 → "1.2k". Keeps a Y axis narrow enough to survive a phone. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}


/**
 * Gridline values for an amount axis, chosen so the steps suit the numbers.
 *
 * Left to itself a chart picks round hundreds, which is useless in a month
 * whose whole spend is forty euros — every line sits squashed against the
 * bottom of the first band. Stepping by whatever "round" means at this scale
 * keeps the same chart readable at €40 and at €4,000.
 */
export function amountTicks(max: number, target = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];

  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const step = steps.find((candidate) => max / candidate <= target) ?? steps[steps.length - 1];
  const top = Math.ceil(max / step) * step;

  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
