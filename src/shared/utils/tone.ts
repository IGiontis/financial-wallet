import type { CSSProperties } from "react";

/** The meanings that colour the app — see «Tones» in index.css. */
export type Tone = "income" | "expense" | "goal" | "invest" | "pending";

/**
 * A chip in a meaning's colour: its own chip ground (`--{tone}-chip`, the tone
 * mixed into the card surface at a strength you can see — index.css, «Chips»),
 * a 1px edge in the tone drawn inside it (an inset shadow, so no chip changes
 * size), and the text-safe shade of the colour on it. `strong` for the one
 * chosen or meant to stand out: the stronger ground and edge.
 */
export const toneChip = (tone: Tone, strong = false): CSSProperties => ({
  background: `var(--${tone}-chip${strong ? "-strong" : ""})`,
  color: `var(--color-${tone}-text)`,
  boxShadow: `inset 0 0 0 1px var(--${tone}-edge${strong ? "-strong" : ""})`,
});
