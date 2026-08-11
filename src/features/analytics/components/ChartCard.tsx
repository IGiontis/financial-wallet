import { useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Shown instead of the chart when there isn't enough data to plot. */
  empty?: string;
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
 */
export function ChartCard({ title, hint, value, valueTone = "neutral", wide, tall, empty, footer, children }: ChartCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (jsdom, very old browsers) there is nothing to
  // defer against, so start visible rather than never rendering the chart.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

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

  return (
    <section ref={ref} className={`${styles.card} ${wide ? styles.wide : ""}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardHeadText}>
          {/* h3: the page's group headings are the h2s, and each card sits
              under one of them. */}
          <h3 className={styles.cardTitle}>{title}</h3>
          {hint && <p className={styles.cardHint}>{hint}</p>}
        </div>
        {value !== undefined && (
          <div className={styles.cardValue} style={{ color: toneColor }}>
            {value}
          </div>
        )}
      </div>

      <div className={`${styles.chartArea} ${tall ? styles.tall : ""}`}>
        {empty ? <p className={styles.emptyNote}>{empty}</p> : visible ? children : null}
      </div>

      {footer && !empty && footer}
    </section>
  );
}
