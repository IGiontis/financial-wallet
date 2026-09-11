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
  const millions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return millions(value);

  if (abs >= 1_000) {
    const digits = abs >= 10_000 ? 0 : 1;
    const thousands = Number((value / 1_000).toFixed(digits));
    // 999,999 rounds to "1000k" at whole thousands, which is a millions figure
    // wearing a thousands suffix.
    return Math.abs(thousands) >= 1000 ? millions(value) : `${thousands.toFixed(digits)}k`;
  }

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


/**
 * Round a bound out to a number an axis can put a tick on.
 *
 * Same ladder `amountTicks` climbs, so a chart using both lands on the same
 * kind of number at every scale.
 */
function niceBound(value: number): number {
  if (value <= 0) return 0;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  const step = steps.find((candidate) => value / candidate <= 5) ?? steps[steps.length - 1];
  return Math.ceil(value / step) * step;
}

/**
 * Domains for a two-axis chart that put both zeros at the same height.
 *
 * A chart with bars on the left scale and a line on the right has two zeros,
 * and by default they land wherever each axis happens to put them. On the
 * planner that produced a reading no one should have to make: a month ending
 * with €684 in the bank drew its point *below* the only zero line on the
 * screen, because that line belonged to the bars' axis, whose zero sat halfway
 * up while the balance axis started at the floor. The figure was right and the
 * picture said the opposite.
 *
 * Giving both axes the same zero fraction fixes it at the source. The bars keep
 * their own scale — which is the whole reason for the second axis, since a
 * year of €1,800 months ends near €14,000 and one shared scale flattens every
 * bar — but a positive balance can now never be drawn below zero.
 */
export function alignedZeroDomains(
  flow: { min: number; max: number },
  balance: { min: number; max: number },
): { flow: [number, number]; balance: [number, number] } {
  // Both axes have to contain zero, or a shared zero line is a line through
  // only one of them.
  const flowMax = niceBound(Math.max(flow.max, 0));
  const flowMin = -niceBound(-Math.min(flow.min, 0));
  const balMax = Math.max(balance.max, 0);
  const balMin = Math.min(balance.min, 0);

  const span = flowMax - flowMin;
  if (span <= 0) return { flow: [0, 1], balance: [0, Math.max(balMax, 1)] };

  /** Share of the plot's height sitting above zero. */
  const above = flowMax / span;

  // All of the flow on one side of zero puts the zero on an edge, and the
  // balance has to sit on the same edge rather than be scaled to meet it.
  if (above >= 1) return { flow: [0, flowMax], balance: [0, niceBound(Math.max(balMax, 1))] };
  if (above <= 0) return { flow: [flowMin, 0], balance: [-niceBound(Math.max(-balMin, 1)), 0] };

  // One height, split by that same share. Whichever end needs more room decides
  // the scale, so neither end clips.
  const scale = Math.max(balMax / above, -balMin / (1 - above), 1);
  return { flow: [flowMin, flowMax], balance: [-scale * (1 - above), scale * above] };
}
