import styles from "./css/Analytics.module.css";

// A key for charts whose lines differ by stroke rather than colour: a small
// sample of each line, solid, dashed or dotted, instead of the usual square.

export function LineKey({ items }: { items: { color: string; label: string; dash?: string; opacity?: number }[] }) {
  return (
    <div className={styles.legend}>
      {items.map((item) => (
        <span key={item.label} className={styles.legendItem}>
          <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden style={{ flexShrink: 0 }}>
            <line x1="1" y1="4" x2="21" y2="4" stroke={item.color} strokeOpacity={item.opacity ?? 1} strokeWidth={2.5} strokeDasharray={item.dash} strokeLinecap="round" />
          </svg>
          <span className="text-truncate">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
