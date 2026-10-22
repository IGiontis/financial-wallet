import type { CSSProperties } from "react";

/** The meanings that colour the app — see «Tones» in index.css. */
export type Tone = "income" | "expense" | "goal" | "invest" | "pending";

/**
 * A chip in a meaning's colour: the shared wash behind it and the text-safe
 * shade of the colour on it. From the tone tokens, so every chip in the app is
 * the same strength and follows the theme; `strong` for the one chosen or
 * meant to stand out.
 */
export const toneChip = (tone: Tone, strong = false): CSSProperties => ({
  background: `var(--${tone}-wash${strong ? "-strong" : ""})`,
  color: `var(--color-${tone}-text)`,
});
