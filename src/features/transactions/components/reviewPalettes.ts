// ─── Review palettes ──────────────────────────────────────────────────────────
// Derived from the semantic tokens instead of fixed pastels, so the review
// screen stays legible in both themes. Tints are kept low (8–16%) so the panel
// reads as a calm surface rather than a block of saturated colour.

const palette = (token: string, sign: string) => ({
  cardBorder: `var(${token})`,
  heroBg: `color-mix(in srgb, var(${token}) 8%, var(--color-surface))`,
  heroBorder: `color-mix(in srgb, var(${token}) 28%, transparent)`,
  iconBg: `color-mix(in srgb, var(${token}) 16%, transparent)`,
  // Headline stays neutral — only the amount and accents carry colour.
  nameTxt: "var(--color-text-primary)",
  subTxt: `var(${token})`,
  badgeBg: `color-mix(in srgb, var(${token}) 16%, transparent)`,
  badgeTxt: `var(${token})`,
  amtTxt: `var(${token})`,
  sign,
});

export const EXPENSE_COLORS = palette("--color-expense", "−");
export const INCOME_COLORS = palette("--color-income", "+");
export const GOAL_COLORS = palette("--color-goal", "");
export const INVESTMENT_COLORS = palette("--color-invest", "");

export type ReviewColors = typeof EXPENSE_COLORS;
