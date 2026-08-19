import { useMemo } from "react";
import type { ProjectionPoint } from "./plannerUtils";
import styles from "./css/PlannerPage.module.css";

const PAD = { top: 10, right: 8, bottom: 10, left: 8 };
const VIEW = { width: 320, height: 120 };

/**
 * The running balance to the end of the window, with each event marked on the
 * day it lands and every day tappable.
 *
 * Hand-drawn SVG rather than a chart library: it is one line, one zero rule and
 * a handful of dots, and pulling in recharts for it would be the heaviest thing
 * on an otherwise light page.
 *
 * Scaled with a viewBox and `preserveAspectRatio="none"` so the same drawing
 * fills a short box on a phone and a taller one on a desktop. The hit targets
 * scale with it, which is why they are drawn rather than measured.
 */
export function BalanceLine({
  points,
  breaksOnIndex,
  selectedIndex,
  onSelect,
  ariaLabel,
}: {
  points: ProjectionPoint[];
  breaksOnIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
}) {
  const geometry = useMemo(() => {
    if (points.length === 0) return undefined;

    const balances = points.map((p) => p.balance);
    const max = Math.max(...balances, 0);
    const min = Math.min(...balances, 0);
    // A flat line still needs a range, or every point lands on the same pixel.
    const span = max - min || Math.max(Math.abs(max), 1);

    const plotWidth = VIEW.width - PAD.left - PAD.right;
    const plotHeight = VIEW.height - PAD.top - PAD.bottom;

    const x = (index: number) => PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => PAD.top + ((max - value) / span) * plotHeight;

    return {
      x,
      y,
      zeroY: y(0),
      bandWidth: plotWidth / Math.max(points.length, 1),
      line: points.map((p, i) => `${x(i)},${y(p.balance)}`).join(" "),
      // Closing the path down to the zero rule shades the area, which reads as
      // "this is what you have" far faster than a bare stroke.
      area: `${PAD.left},${y(0)} ${points.map((p, i) => `${x(i)},${y(p.balance)}`).join(" ")} ${x(points.length - 1)},${y(0)}`,
      // On a long horizon one dot per bill is a smear, so only days carrying an
      // outgoing big enough to matter get marked.
      markers: points.flatMap((p, i) => (p.events.length > 0 ? [{ index: i, point: p }] : [])),
      // Month starts, so a three- or six-month line can be read against the
      // calendar instead of as one undifferentiated slope.
      monthBreaks: points.flatMap((p, i) => (i > 0 && p.date.getDate() === 1 ? [i] : [])),
    };
  }, [points]);

  if (!geometry) return null;

  const broke = breaksOnIndex >= 0;
  const stroke = broke ? "var(--color-expense)" : "var(--color-income)";

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id="plannerFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {geometry.monthBreaks.map((index) => (
        <line
          key={`month-${index}`}
          x1={geometry.x(index)}
          y1={0}
          x2={geometry.x(index)}
          y2={VIEW.height}
          stroke="var(--color-border-tertiary)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <polygon points={geometry.area} fill="url(#plannerFill)" />

      {/* Zero is the only gridline that means anything here. */}
      <line
        x1={PAD.left}
        y1={geometry.zeroY}
        x2={VIEW.width - PAD.right}
        y2={geometry.zeroY}
        stroke="var(--color-border-primary)"
        strokeWidth={1}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />

      <polyline points={geometry.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

      {geometry.markers.map(({ index, point }) => (
        <circle
          key={point.date.toISOString()}
          cx={geometry.x(index)}
          cy={geometry.y(point.balance)}
          r={3}
          fill={point.balance < 0 ? "var(--color-expense)" : point.events.some((e) => e.amount > 0) ? "var(--color-income)" : "var(--bs-primary)"}
          stroke="var(--color-surface)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}

      {broke && (
        <circle
          cx={geometry.x(breaksOnIndex)}
          cy={geometry.y(points[breaksOnIndex].balance)}
          r={5}
          fill="var(--color-expense)"
          stroke="var(--color-surface)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {selectedIndex >= 0 && selectedIndex < points.length && (
        <>
          <line
            x1={geometry.x(selectedIndex)}
            y1={PAD.top}
            x2={geometry.x(selectedIndex)}
            y2={VIEW.height - PAD.bottom}
            stroke="var(--color-text-secondary)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <circle
            cx={geometry.x(selectedIndex)}
            cy={geometry.y(points[selectedIndex].balance)}
            r={4.5}
            fill="var(--color-surface)"
            stroke={stroke}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}

      {/* One invisible band per day. Drawn last so it sits above everything, and
          full-height so a tap anywhere in the column counts. */}
      {points.map((point, index) => (
        <rect
          key={`hit-${point.date.toISOString()}`}
          x={geometry.x(index) - geometry.bandWidth / 2}
          y={0}
          width={geometry.bandWidth}
          height={VIEW.height}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => onSelect(index)}
        />
      ))}
    </svg>
  );
}
