import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isSameDay } from "date-fns";
import styles from "../css/MoneyTree.module.css";

/** One thing on a day: a leaf of the tree. */
export interface TreeLeaf {
  id: string;
  direction: "in" | "out";
  label: string;
  /** Always positive: `direction` says which way. */
  amount: number;
  icon?: string;
  /** Under the name: its state, its category — whatever the page says of it. */
  note?: ReactNode;
  /** Quiet and struck through: it has happened. */
  done?: boolean;
  /** Filled red: it wants doing — a bill to pay, money that is late. */
  late?: boolean;
  /** Outlined, dashed: still to come. */
  upcoming?: boolean;
  approximate?: boolean;
  /** No sign on the figure: a move between pockets, neither in nor out. */
  neutral?: boolean;
}

export interface TreeDay {
  date: Date;
  leaves: TreeLeaf[];
}

/**
 * Money as a tree: the days down a trunk, each day a node on it, and what
 * lands on it as leaves either side. Two-sided, money in grows to the left and
 * money out to the right, so a glance down the trunk shows which side a stretch
 * leans; one-sided, the days take turns, so neighbours do not crowd. On a phone
 * the trunk moves to the left edge and every leaf hangs to its right.
 *
 * Only the drawing: the timelines (`MoneyTimeline`) and «Συναλλαγές» each say
 * what the days and leaves are.
 */
export function MoneyTree({
  days,
  twoSided,
  today,
  formatCurrency,
  locale,
  label,
  onOpen,
}: {
  days: TreeDay[];
  twoSided: boolean;
  today: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  label: string;
  /** A leaf as a button that opens what it stands for. */
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short" }), [locale]);

  let index = 0;
  const leaf = (item: TreeLeaf) => {
    const body = (
      <>
        {item.icon && (
          <span className={styles.leafIcon} aria-hidden>
            {item.icon}
          </span>
        )}
        <span className={styles.leafText}>
          <span className={styles.leafName}>{item.label}</span>
          {item.note && <span className={styles.leafNote}>{item.note}</span>}
        </span>
        <span className={styles.leafAmount}>
          {item.neutral ? "" : item.direction === "in" ? "+" : "−"}
          {item.approximate ? "≈" : ""}
          {formatCurrency(item.amount)}
        </span>
      </>
    );
    const className = `${styles.leaf} ${item.neutral ? "" : item.direction === "in" ? styles.leafIn : styles.leafOut} ${item.done ? styles.done : ""} ${item.late ? styles.late : ""} ${item.upcoming ? styles.upcoming : ""}`;
    const style = { "--i": index++ } as CSSProperties;
    return (
      <li key={item.id} className={className} style={style}>
        {onOpen ? (
          <button type="button" className={`${styles.leafBody} ${styles.leafButton}`} onClick={() => onOpen(item.id)}>
            {body}
          </button>
        ) : (
          <div className={styles.leafBody}>{body}</div>
        )}
      </li>
    );
  };

  return (
    // The wrapper is what the layout measures: two-sided where the tree has the
    // room, one column where it does not — a phone, or a narrow column on a desk.
    <div className={styles.frame}>
      <ol className={styles.tree} aria-label={label}>
        {days.map((day, dayIndex) => {
          const isToday = isSameDay(day.date, today);
          const left = twoSided ? day.leaves.filter((l) => l.direction === "in") : dayIndex % 2 === 0 ? day.leaves : [];
          const right = twoSided ? day.leaves.filter((l) => l.direction === "out") : dayIndex % 2 === 0 ? [] : day.leaves;
          return (
            <li key={day.date.getTime()} className={`${styles.day} ${isToday ? styles.today : ""} ${day.date < today && !isToday ? styles.past : ""}`}>
              <ul className={styles.left}>{left.map(leaf)}</ul>
              <div className={styles.node}>
                <span className={styles.nodeWeekday}>{isToday ? t("timeline.today") : weekdayFmt.format(day.date)}</span>
                <span className={styles.nodeDate}>{dayFmt.format(day.date)}</span>
              </div>
              <ul className={styles.right}>{right.map(leaf)}</ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default MoneyTree;
