import { type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isSameDay } from "date-fns";
import { FiArrowDownLeft, FiArrowUpRight } from "react-icons/fi";
import styles from "../css/MoneyTree.module.css";
import { dateFormat } from "../utils/dates";

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
 * lands on it as leaves either side.
 *
 * One side rule, in every tree in the app: money in grows to the LEFT of the
 * trunk and money out to the RIGHT — even in a tree of one kind, so a
 * bills-only tree hangs everything right and an incomes-only one everything
 * left. The side itself says in or out at a glance, before the colour and the
 * sign do. (One-sided trees used to let the days take turns, which made the
 * side mean nothing.) On a phone, or in a narrow column, the trunk moves to
 * the left edge and every leaf hangs to its right; there the colour, the sign
 * and a small ↙/↗ mark on each leaf carry what the side no longer can.
 *
 * Only the drawing: the timelines (`MoneyTimeline`) and «Συναλλαγές» each say
 * what the days and leaves are.
 */
export function MoneyTree({
  days,
  today,
  formatCurrency,
  locale,
  label,
  onOpen,
}: {
  days: TreeDay[];
  /**
   * @deprecated Ignored: every tree puts money in on the left and money out
   * on the right now, one kind or both. Kept so callers need not change at once.
   */
  twoSided?: boolean;
  today: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  label: string;
  /** A leaf as a button that opens what it stands for. */
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dayFmt = dateFormat("dayShort", locale);
  const weekdayFmt = dateFormat("weekdayShort", locale);

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
        {/* In or out, where the side no longer says it (a narrow tree). */}
        {!item.neutral && (
          <span className={styles.leafDir} title={t(item.direction === "in" ? "timeline.dirIn" : "timeline.dirOut")}>
            {item.direction === "in" ? <FiArrowDownLeft aria-hidden /> : <FiArrowUpRight aria-hidden />}
            <span className="visually-hidden">{t(item.direction === "in" ? "timeline.dirIn" : "timeline.dirOut")}</span>
          </span>
        )}
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
        {days.map((day) => {
          const isToday = isSameDay(day.date, today);
          // In left, out right — always. A neutral move goes by its direction too.
          const left = day.leaves.filter((l) => l.direction === "in");
          const right = day.leaves.filter((l) => l.direction === "out");
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
