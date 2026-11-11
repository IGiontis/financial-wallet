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
export const CURSOR_FILL = { fill: "color-mix(in srgb, var(--color-text-secondary) 10%, transparent)", radius: 4 } as const;

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
 * A money axis tick in the app's own currency style, compact: «1,2k €» in
 * Greek, «€1.2k» in English. The symbol, where it sits and the decimal mark
 * are read off the app's formatter itself, so the axis can't disagree with the
 * figures in the tooltip. Below zero with a true minus.
 */
export function moneyTickWith(format: (n: number) => string): (n: number) => string {
  const zero = format(0);
  const digits = zero.match(/0(?:[.,]0+)?/)?.[0];
  const comma = /1,5/.test(format(1.5));
  return (n: number) => {
    const figure = compactNumber(Math.abs(n));
    const local = comma ? figure.replace(".", ",") : figure;
    const text = digits ? zero.replace(digits, local) : local;
    return n < 0 ? `−${text}` : text;
  };
}

/**
 * The vertical money axis every Statistics chart carries: compact figures, no
 * line or ticks, wide enough for «12,5k €» and narrow enough to leave a phone
 * its bars. Spread onto recharts' <YAxis>.
 */
export const moneyAxis = (format: (n: number) => string) =>
  // Whole units only: on a tiny range the axis would pick 1.25, 2.5 … and the
  // ticks, rounded for display, would read «1 €, 3 €» — steps that lie.
  ({ tickFormatter: moneyTickWith(format), tick: AXIS_TICK, axisLine: false, tickLine: false, width: 50, tickCount: 4, allowDecimals: false }) as const;

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


// ─── Signs ───────────────────────────────────────────────────────────────────
//
// One rule for every figure on the Statistics page, its tooltips, tables and
// legends. A figure that is a CHANGE or a NET — the month's net, a difference,
// what is left after the bills — is signed both ways: «+» for in or up, «−»
// for out or down, nothing on a zero. A figure that is an AMOUNT — what came
// in, what was spent — carries no sign; the label says which way it went, and
// should one ever be below zero it reads «−», never the hyphen `Intl` writes.
// The minus is always the true one (U+2212). Colour follows as a second cue,
// never as the only one: a red figure with no sign is the inconsistency the
// owner kept finding, «−42» in one card and a bare red «42» in the next.

/** "+12,00 €" / "−12,00 €" — a change or a net, signed with a true minus. */
export const signedWith = (format: (n: number) => string) => (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${format(Math.abs(n))}`;

/** "12,00 €" / "−12,00 €" — an amount: unsigned, but a negative one with a true minus, not `Intl`'s hyphen. */
export const amountWith = (format: (n: number) => string) => (n: number) => `${n < 0 ? "−" : ""}${format(Math.abs(n))}`;

/** "+12%" / "−12%" — a change as a share, whole percent. */
export const signedPercent = (n: number) => {
  const whole = Math.round(n);
  return `${whole > 0 ? "+" : whole < 0 ? "−" : ""}${Math.abs(whole)}%`;
};

/** An axis tick that can go below zero: compact, with a true minus. */
export const signedCompact = (n: number) => (n < 0 ? `−${compactNumber(-n)}` : compactNumber(n));
