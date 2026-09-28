import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { compactNumber } from "../analytics/components/chartTheme";
import { calendarTicks, markerIndexes, nearestIndex, valueScale } from "./balanceLineScale";
import type { PointStep, ProjectionPoint } from "./plannerUtils";
import styles from "./css/PlannerPage.module.css";

// Room for the amounts on the right and the dates underneath.
const PAD = { top: 10, right: 46, bottom: 24, left: 8 };
// Until the box has been measured — and in tests, where nothing is laid out.
const FALLBACK = { width: 320, height: 190 };
// "5k", not "5.0k": the scale's amounts are round by construction, and the
// crosshair's is a glance — the exact figure is printed above the chart.
const short = (value: number) => compactNumber(value).replace(/\.0(?=[kM])/, "");

/**
 * The running balance to the end of the window, read by dragging a finger
 * along it.
 *
 * A crosshair follows the finger: the amount is pinned to the right-hand scale
 * and the date to the bottom one, and the day's figures are printed above the
 * chart by the card, where the finger cannot cover them. It snaps to the nearest
 * point, so ten years of monthly points need no more precision than a month of
 * daily ones.
 *
 * Hand-drawn SVG rather than a chart library: one line, a few labels and a
 * handful of dots, and recharts would be the heaviest thing on the page.
 *
 * Drawn at the size it is actually given, measured, rather than stretched from
 * a fixed box. Stretching was fine while it was only lines, but squeezes any
 * lettering out of shape, and this now carries amounts and dates.
 */
function BalanceLineBase({
  points,
  start,
  end,
  pointStep,
  breaksOnIndex,
  selectedIndex,
  onSelect,
  ariaLabel,
  locale,
}: {
  points: ProjectionPoint[];
  /** The window, so days sit where they fall in time and not where they fall in the list. */
  start: Date;
  end: Date;
  pointStep: PointStep;
  breaksOnIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  locale: string;
}) {
  // useId's colons are fine in an id and not in a `url(#…)` reference.
  const gradientId = `balance-fill-${useId().replace(/[^\w-]/g, "")}`;
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);
  const dragging = useRef(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const width = Math.round(box.clientWidth);
      const height = Math.round(box.clientHeight);
      if (width > 0 && height > 0) setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (points.length === 0) return undefined;
    const { width, height } = size;
    const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
    const plotHeight = Math.max(height - PAD.top - PAD.bottom, 1);
    const from = start.getTime();
    // A window of one day still needs a width to spread over.
    const span = Math.max(end.getTime() - from, 1);

    const scale = valueScale(points.map((p) => p.balance));
    const xAt = (time: number) => PAD.left + ((time - from) / span) * plotWidth;
    const x = (index: number) => xAt(points[index].date.getTime());
    const y = (value: number) => PAD.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;

    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
    const floor = y(Math.max(scale.min, 0));
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

    return {
      width,
      height,
      plotRight: width - PAD.right,
      plotBottom: height - PAD.bottom,
      from,
      span,
      plotWidth,
      scale,
      x,
      y,
      line,
      // Closing the path down to zero shades the area, which reads as "this is
      // what you have" far faster than a bare stroke.
      area: `${x(0).toFixed(1)},${floor} ${line} ${x(points.length - 1).toFixed(1)},${floor}`,
      markers: markerIndexes(points, x),
      ticks: calendarTicks({
        start,
        end,
        daily: pointStep === "day",
        x: xAt,
        left: PAD.left,
        right: width - PAD.right,
        formatMonth: (d) => monthFmt.format(d),
        formatDay: (d) => dayFmt.format(d),
      }),
    };
  }, [points, start, end, pointStep, size, locale]);

  // The date on the pill under the crosshair: a day, or on a monthly line the
  // month — unless the point is the one kept for a dip, which is a single day.
  const pillFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const monthPillFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }), [locale]);

  const indexAt = (clientX: number, target: SVGSVGElement) => {
    if (!geometry) return -1;
    const px = clientX - target.getBoundingClientRect().left;
    return nearestIndex(points, geometry.from + ((px - PAD.left) / geometry.plotWidth) * geometry.span);
  };
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const index = indexAt(event.clientX, event.currentTarget);
    // Only when it moves to another point: every call re-renders the card.
    if (index >= 0 && index !== selectedIndex) onSelect(index);
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = points.length - 1;
    const from = selectedIndex < 0 ? 0 : selectedIndex;
    const next =
      event.key === "ArrowRight" ? Math.min(from + (selectedIndex < 0 ? 0 : 1), last)
      : event.key === "ArrowLeft" ? Math.max(from - 1, 0)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onSelect(next);
  };

  if (!geometry) return <div ref={boxRef} className={styles.chartBox} />;

  const { width, height, plotRight, plotBottom, scale, x, y } = geometry;
  const broke = breaksOnIndex >= 0;
  const stroke = broke ? "var(--color-expense)" : "var(--color-income)";
  const selected = selectedIndex >= 0 && selectedIndex < points.length ? points[selectedIndex] : undefined;

  let crosshair: ReactNode = null;
  let hiddenNear = Number.NaN;
  let pillHalf = 0;
  if (selected) {
    const cx = x(selectedIndex);
    const cy = y(selected.balance);
    const d = selected.date;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate();
    const dateText = pointStep === "month" && monthEnd ? monthPillFmt.format(d) : pillFmt.format(d);
    const valueText = short(selected.balance);
    const dateWidth = Math.max(dateText.length * 6.4 + 14, 46);
    const valueWidth = Math.max(valueText.length * 6.6 + 12, 40);
    const dateX = Math.min(Math.max(cx - dateWidth / 2, PAD.left), plotRight - dateWidth);
    const valueX = Math.min(plotRight + 2, width - valueWidth);
    const negative = selected.balance < 0;
    hiddenNear = dateX + dateWidth / 2;
    pillHalf = dateWidth / 2;

    crosshair = (
      <g pointerEvents="none">
        <line x1={cx} y1={PAD.top} x2={cx} y2={plotBottom} stroke="var(--color-text-primary)" strokeWidth={1} strokeDasharray="3 2" />
        <line x1={PAD.left} y1={cy} x2={plotRight} y2={cy} stroke="var(--color-text-primary)" strokeWidth={1} strokeDasharray="3 2" />
        <circle cx={cx} cy={cy} r={10} fill={stroke} opacity={0.2} />
        <circle cx={cx} cy={cy} r={5} fill="var(--color-surface)" stroke={stroke} strokeWidth={2.5} />
        <rect x={valueX} y={cy - 10} width={valueWidth} height={20} rx={5} fill="var(--color-text-primary)" />
        <text x={valueX + valueWidth / 2} y={cy + 4} textAnchor="middle" className={styles.chartPill} fill={negative ? "var(--color-expense)" : "var(--color-surface)"}>
          {valueText}
        </text>
        <rect x={dateX} y={plotBottom + 4} width={dateWidth} height={19} rx={5} fill="var(--color-text-primary)" />
        <text x={dateX + dateWidth / 2} y={plotBottom + 17.5} textAnchor="middle" className={styles.chartPill} fill="var(--color-surface)">
          {dateText}
        </text>
      </g>
    );
  }

  return (
    <div ref={boxRef} className={styles.chartBox}>
      <svg
        className={styles.chartSvg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pick(event);
        }}
        onPointerMove={(event) => {
          // A mouse reads by hovering; a finger has to be down, or brushing
          // past the chart while scrolling would move the selection.
          if (dragging.current || event.pointerType === "mouse") pick(event);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Round amounts across, labelled on the right where a thumb holding
            the phone does not sit over them. Zero is drawn heavier: it is the
            line the whole page is about. */}
        {scale.ticks.map((tick) => (
          <g key={`tick-${tick}`}>
            <line
              x1={PAD.left}
              y1={y(tick)}
              x2={plotRight}
              y2={y(tick)}
              stroke={tick === 0 ? "var(--color-border-primary)" : "var(--color-border-tertiary)"}
              strokeWidth={1}
              strokeDasharray={tick === 0 ? "4 3" : undefined}
            />
            <text x={plotRight + 6} y={y(tick) + 4} className={styles.chartTick}>
              {short(tick)}
            </text>
          </g>
        ))}

        <polygon points={geometry.area} fill={`url(#${gradientId})`} />
        <polyline points={geometry.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />

        {geometry.markers.map((index) => {
          const point = points[index];
          // Which way the balance went, not what the point holds: on a monthly
          // line every point holds a pay day, and August's drop came out green.
          const net = index > 0 ? point.balance - points[index - 1].balance : point.events.reduce((sum, e) => sum + e.amount, 0);
          return (
            <circle
              key={`m-${point.date.getTime()}`}
              cx={x(index)}
              cy={y(point.balance)}
              r={geometry.markers.length > 12 ? 3 : 3.5}
              fill={point.balance < 0 ? "var(--color-expense)" : net > 0 ? "var(--color-income)" : "var(--bs-primary)"}
              stroke="var(--color-surface)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          );
        })}

        {broke && (
          <circle
            cx={x(breaksOnIndex)}
            cy={y(points[breaksOnIndex].balance)}
            r={5}
            fill="var(--color-expense)"
            stroke="var(--color-surface)"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}

        {/* Calendar labels, minus any the date pill would sit on. */}
        {geometry.ticks
          .filter((tick) => !(Math.abs(tick.x - hiddenNear) < pillHalf + tick.label.length * 3.4 + 6))
          .map((tick) => (
            <text key={`d-${tick.time}`} x={tick.x} y={height - 7} textAnchor="middle" className={styles.chartTick}>
              {tick.label}
            </text>
          ))}

        {crosshair}
      </svg>
    </div>
  );
}

/**
 * Skipped while nothing it draws has changed.
 *
 * Typing in the opening balance re-renders the page on every character, and
 * this is the most expensive thing on it — a few hundred SVG nodes that are
 * identical until the projection itself moves.
 */
export const BalanceLine = memo(BalanceLineBase);
