import styles from "./css/Analytics.module.css";

/**
 * Key for a chart's series. Written by hand rather than using recharts' own
 * `<Legend>` so it sits outside the fixed-height chart box — inside it, the
 * legend would eat the plot area instead of adding to the card.
 */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className={styles.legend}>
      {items.map((item) => (
        <span key={item.label} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: item.color }} />
          <span className="text-truncate">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
