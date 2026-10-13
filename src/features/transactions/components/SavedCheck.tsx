import type { CSSProperties } from "react";
import styles from "./css/TransactionWizard.module.css";

// Where the sparks fly: twelve around the circle, every other one a little
// further out, in the app's own colours.
const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  angle: i * 30 + (i % 2 ? 8 : -6),
  distance: i % 2 ? 46 : 38,
  color: ["var(--color-income)", "var(--bs-primary)", "var(--color-goal)", "var(--color-invest)"][i % 4],
}));

/**
 * The tick on a saved panel, drawn rather than shown: the circle traces round,
 * the tick strokes in, a ring breathes out and a few sparks fly off it. A
 * moment of "done" at the end of a wizard instead of a card swapped in dry.
 * With reduced motion asked for, all of it is simply there.
 */
export function SavedCheck() {
  return (
    <span className={styles.savedBurst} aria-hidden>
      <span className={styles.savedRing} />
      {SPARKS.map((s, i) => (
        <span key={i} className={styles.savedSpark} style={{ "--a": `${s.angle}deg`, "--d": `${s.distance}px`, "--c": s.color } as CSSProperties} />
      ))}
      <svg className={styles.savedSvg} viewBox="0 0 56 56">
        <circle className={styles.savedCircle} cx="28" cy="28" r="25" />
        <path className={styles.savedTick} d="M17 29 l7.5 7.5 L39.5 21" />
      </svg>
    </span>
  );
}
