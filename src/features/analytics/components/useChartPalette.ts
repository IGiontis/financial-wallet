import { useEffect, useState } from "react";

// ECharts resolves colours itself rather than handing them to CSS, so unlike
// the recharts charts on this page it cannot be given `var(--token)` — every
// value has to be a literal. This reads the same design tokens once per theme.

export interface ChartPalette {
  text: string;
  textSecondary: string;
  border: string;
  surface: string;
  background: string;
  tooltipBg: string;
  tooltipText: string;
  primary: string;
  income: string;
  expense: string;
  invest: string;
  goal: string;
  /** Same six accents, same order, as the recharts charts use. */
  accents: string[];
}

const token = (styles: CSSStyleDeclaration, name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

function readPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);

  const primary = token(styles, "--bs-primary", "#0d6efd");
  const expense = token(styles, "--color-expense", "#dc2626");
  const income = token(styles, "--color-income", "#16a34a");
  const invest = token(styles, "--color-invest", "#6366f1");
  const goal = token(styles, "--color-goal", "#d97706");
  const textSecondary = token(styles, "--color-text-secondary", "#52627a");

  return {
    text: token(styles, "--color-text-primary", "#16202e"),
    textSecondary,
    border: token(styles, "--color-border-tertiary", "#dde3ea"),
    surface: token(styles, "--color-surface", "#ffffff"),
    background: token(styles, "--color-background-secondary", "#f1f4f8"),
    tooltipBg: token(styles, "--color-tooltip-bg", "#1e293b"),
    tooltipText: token(styles, "--color-tooltip-text", "#ffffff"),
    primary,
    income,
    expense,
    invest,
    goal,
    accents: [primary, expense, income, invest, goal, textSecondary],
  };
}

/**
 * The active theme lives on `data-bs-theme` at the document root, which
 * ThemeProvider sets from an effect.
 *
 * Watching that attribute is the only reliable trigger. Keying off the theme
 * context value instead would read the *previous* theme's colours: effects in a
 * child component run before the provider's own effect, so on the render where
 * the theme flips the attribute — and therefore every resolved token — is still
 * the old one.
 */
export function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState(readPalette);

  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

/** Fades an accent for a nested ring or a secondary series. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;

  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);

  return Number.isNaN(r + g + b) ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Tooltip chrome shared by all three ECharts charts, matching TooltipShell. */
export function tooltipStyle(palette: ChartPalette) {
  return {
    backgroundColor: palette.tooltipBg,
    borderWidth: 0,
    padding: [10, 14] as [number, number],
    textStyle: { color: palette.tooltipText, fontSize: 12.5 },
    extraCssText: "border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);",
  };
}
