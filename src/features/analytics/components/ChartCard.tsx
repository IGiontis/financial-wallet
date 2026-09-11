import { useEffect, useRef, useState, type ReactNode } from "react";
import { ZoomButton, ZoomModal } from "../../../shared/components/ChartZoom";
import styles from "./css/Analytics.module.css";

interface ChartCardProps {
  title: string;
  hint?: string;
  /** Headline figure shown top-right — the one number the chart is about. */
  value?: ReactNode;
  valueTone?: "income" | "expense" | "neutral";
  /** Spans the full grid width. Use for anything with a long time axis. */
  wide?: boolean;
  /** Taller chart box — for the two long time series that need the vertical room. */
  tall?: boolean;
  /** Taller still. For a plot holding many lines at once: with a dozen
   *  categories a few euros apart, height is the only thing that separates
   *  them, and at `tall` they arrive as one thick band. */
  xtall?: boolean;
  /** Let the content set its own height, for cards that draw rows not plots. */
  auto?: boolean;
  /** Shown instead of the chart when there isn't enough data to plot. */
  empty?: string;
  /** Opt out of the magnify button, for anything a bigger box would not help. */
  zoomable?: boolean;
  /** Sits below the chart box — legends, scales. Outside the fixed height. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Card shell for every chart on the page.
 *
 * The chart itself is only mounted once the card is near the viewport. Nine
 * recharts instances laying themselves out at once is a visible stall on a
 * phone, and most of them are below the fold anyway — the reserved height means
 * scrolling stays stable either way.
 *
 * Every card also opens full-screen. That started as one exception for the
 * Sankey and became the rule: a grid cell is the wrong size for all of these on
 * a phone, and the same drawing given the whole screen is the cheapest fix
 * there is. The modal renders the very same `children`, so a card never has to
 * describe itself twice.
 */
export function ChartCard({ title, hint, value, valueTone = "neutral", wide, tall, xtall, auto, empty, zoomable = true, footer, children }: ChartCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (jsdom, very old browsers) there is nothing to
  // defer against, so start visible rather than never rendering the chart.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      // Start loading a screenful early so the chart is ready on arrival.
      { rootMargin: "300px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const toneColor = valueTone === "income" ? "var(--color-income)" : valueTone === "expense" ? "var(--color-expense)" : "var(--color-text-primary)";
  const canZoom = zoomable && !empty;

  return (
    <section ref={ref} className={`${styles.card} ${wide ? styles.wide : ""}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          {/* h3: the page's group headings are the h2s, and each card sits
              under one of them. */}
          <h3 className={styles.cardTitle}>{title}</h3>
          {hint && <p className={styles.cardHint}>{hint}</p>}
        </div>
        {/* The figure and the button travel together on the right. Loose in the
            header they were two of three items sharing out the free space, so on
            a wide card the figure drifted into the middle and read as belonging
            to nothing. The rule between them is what says they are a pair
            rather than one run-on label. */}
        {(value !== undefined || canZoom) && (
          <div className={styles.cardMeta}>
            {value !== undefined && (
              <div className={styles.cardValue} style={{ color: toneColor }}>
                {value}
              </div>
            )}
            {value !== undefined && canZoom && <span className={styles.cardDivide} aria-hidden />}
            {/* A button rather than making the whole card clickable: several
                cards already answer taps inside the plot, and a card that
                swallowed them would take the tap meant for a bar. */}
            {canZoom && <ZoomButton onClick={() => setZoomed(true)} />}
          </div>
        )}
      </div>

      <div className={`${styles.chartArea} ${tall ? styles.tall : ""} ${xtall ? styles.xtall : ""} ${auto ? styles.auto : ""}`}>
        {empty ? <p className={styles.emptyNote}>{empty}</p> : visible ? children : null}
      </div>

      {footer && !empty && footer}

      {/* Mounted only while open, so the page never carries two copies of a
          chart it isn't showing. */}
      {canZoom && zoomed && (
        <ZoomModal open onClose={() => setZoomed(false)} title={title} hint={hint} footer={footer}>
          {children}
        </ZoomModal>
      )}
    </section>
  );
}
