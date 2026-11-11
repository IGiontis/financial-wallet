import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "../css/SegmentedBar.module.css";

/** One thing a bar stands for: a bill of the month, an income, a planner line. */
export interface BarSegment {
  /** Stable and unique within the bar. */
  id: string;
  label: string;
  /** Its weight on the bar — its amount, positive. Zero or less takes no room and is left out. */
  amount: number;
  /** Paid, arrived, done: drawn filled. The rest are drawn as outlines. */
  done: boolean;
}

/** The meaning colour a bar's done segments are filled with. */
export type SegmentTone = "income" | "expense" | "goal" | "invest" | "brand";

/** More than this and the segments are slivers to squint at: one continuous bar instead. */
export const MAX_SEGMENTS = 24;
/** Narrower than this, a segment is a line, not a piece to count. */
export const MIN_SEGMENT_PX = 3;
/** The gap between segments, in px — `--space-0`, 2px. */
const GAP_PX = 2;

export interface SegmentLayout {
  mode: "segments" | "single";
  /** The segments with room, in order, each with its share of the bar in %; the shares add up to 100. */
  parts: (BarSegment & { pct: number })[];
  /** What is done, as a share of the whole in % — what a single bar fills to. */
  donePct: number;
  doneCount: number;
  total: number;
}

/**
 * How a bar is drawn: each segment as wide as its amount is of the whole, and
 * whether there are few enough, and wide enough, to draw them apart at all.
 * `widthPx`, when known, is the bar's drawn width.
 */
export function segmentLayout(segments: readonly BarSegment[], widthPx?: number): SegmentLayout {
  const kept = segments.filter((s) => s.amount > 0);
  const total = kept.reduce((sum, s) => sum + s.amount, 0);
  // The done ones first, together on the left, then the open ones; the
  // largest first in each — so the filled part reads as one run, heaviest first.
  // (The sort is stable: equal ones keep the order they were given in.)
  const parts = kept.map((s) => ({ ...s, pct: total > 0 ? (s.amount / total) * 100 : 0 })).sort((a, b) => Number(b.done) - Number(a.done) || b.amount - a.amount);
  const done = kept.filter((s) => s.done);
  const donePct = total > 0 ? (done.reduce((sum, s) => sum + s.amount, 0) / total) * 100 : 0;
  // What is left for the segments once the gaps between them are taken out.
  const room = widthPx !== undefined ? widthPx - GAP_PX * Math.max(parts.length - 1, 0) : undefined;
  const tooThin = room !== undefined && parts.some((p) => (p.pct / 100) * room < MIN_SEGMENT_PX);
  const mode = parts.length > MAX_SEGMENTS || parts.length < 1 || tooThin ? "single" : "segments";
  return { mode, parts, donePct, doneCount: done.length, total };
}

/**
 * The share done as a whole number to print: never «100%» while something is
 * still open, nor «0%» once something is done.
 */
export function shownPct(donePct: number): number {
  if (donePct <= 0) return 0;
  if (donePct >= 100) return 100;
  return Math.min(99, Math.max(1, Math.round(donePct)));
}

/**
 * A bar that stands for many things, drawn as one piece per thing: as wide as
 * its amount is of the whole, filled when it is done, an outline while it is
 * not — so the heavy ones and the ones still open can be read off at a glance.
 * The done ones sit together on the left, largest first; when one is done it
 * slides over to join them (a fade instead, with reduced motion). Each piece
 * names itself (a tooltip and its accessible name), and the share done is
 * printed beside the bar.
 *
 * Too many pieces (over 24), or any too thin to see, and it is one continuous
 * bar filled to the share that is done. A bar for one quantity — a goal's %,
 * a limit used — is a plain bar, not this.
 */
export function SegmentedBar({
  segments,
  label,
  describe,
  tone = "income",
  showPct = true,
  className,
}: {
  segments: readonly BarSegment[];
  /** The bar as a whole, for screen readers: «3 από 5 πληρωμένα». */
  label: string;
  /** A segment's words: name, amount and state — «ΔΕΗ · 60,00 € · πληρωμένο». */
  describe: (segment: BarSegment) => string;
  tone?: SegmentTone;
  /** The share done, as «62%», beside the bar. */
  showPct?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || undefined));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = segmentLayout(segments, width);
  const toneClass = styles[`tone_${tone}`];

  // A piece that changes place slides there from where it was (FLIP): its
  // old box is kept from the last drawing, and it is drawn moved back by the
  // difference, then let go. With reduced motion it fades in where it lands.
  const pieces = useRef(new Map<string, HTMLDivElement>());
  const boxes = useRef(new Map<string, { left: number; width: number }>());
  const order = layout.mode === "segments" ? layout.parts.map((p) => `${p.id}:${p.done ? 1 : 0}`).join("|") : "";
  useLayoutEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { left: number; width: number }>();
    pieces.current.forEach((el, id) => {
      const box = el.getBoundingClientRect();
      next.set(id, { left: box.left, width: box.width });
      const before = boxes.current.get(id);
      if (!before || typeof el.animate !== "function") return;
      const dx = before.left - box.left;
      if (Math.abs(dx) < 1) return;
      if (reduce) el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
      else el.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], { duration: 350, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    });
    boxes.current = next;
  }, [order]);

  const pct = shownPct(layout.donePct);

  return (
    <div className={`d-flex align-items-center gap-2 ${className ?? ""}`}>
      {/* Measured on a box that stays put, whichever way the bar inside is drawn. */}
      <div ref={ref} className="flex-grow-1" style={{ minWidth: 0 }}>
        {layout.mode === "single" ? (
          <div
            className={`${styles.track} ${toneClass}`}
            role="progressbar"
            aria-label={label}
            aria-valuenow={Math.round(layout.donePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            data-mode="single"
          >
            <div className={styles.fill} style={{ width: `${Math.min(layout.donePct, 100)}%` }} />
          </div>
        ) : (
          <div className={`${styles.bar} ${toneClass}`} role="list" aria-label={label} data-mode="segments">
            {layout.parts.map((part) => {
              const words = describe(part);
              return (
                <div
                  key={part.id}
                  ref={(el) => {
                    if (el) pieces.current.set(part.id, el);
                    else pieces.current.delete(part.id);
                  }}
                  role="listitem"
                  aria-label={words}
                  title={words}
                  className={`${styles.segment} ${part.done ? styles.done : styles.open}`}
                  style={{ flexGrow: part.pct }}
                  data-pct={part.pct}
                />
              );
            })}
          </div>
        )}
      </div>
      {showPct && (
        <span className={styles.pct} data-testid="segmented-pct">
          {pct}%
        </span>
      )}
    </div>
  );
}

export default SegmentedBar;
