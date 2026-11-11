/**
 * An icon field (a category's, a goal's) takes ONE icon: a single emoji or
 * pictograph as the eye sees it — 👍, 👨‍👩‍👧, 🇬🇷, ❤️ — not a word, a letter or two
 * emoji. Counted with `Intl.Segmenter` (a family or a flag is many code units
 * but one picture) and checked with `\p{Extended_Pictographic}` (flags are
 * two regional-indicator letters, accepted as one).
 */

const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;

/** The grapheme clusters of a string, as people count characters. */
export function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((s) => s.segment);
  }
  return Array.from(value);
}

/** Whether `value` (trimmed) is exactly one emoji / pictograph. Empty is not. */
export function isSingleIcon(value: string): boolean {
  const parts = graphemes(value.trim());
  if (parts.length !== 1) return false;
  return PICTOGRAPH.test(parts[0]) || FLAG.test(parts[0]);
}

/**
 * What an optional icon field holds: "" (none), or the problem to show.
 * Returns undefined when the value is fine.
 */
export function iconProblem(value: string): "validation.iconOnlyOne" | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return isSingleIcon(v) ? undefined : "validation.iconOnlyOne";
}
