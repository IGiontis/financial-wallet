import { type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isSameDay } from "date-fns";
import { FiAlertCircle, FiAlertTriangle, FiCheck, FiClock, FiFlag } from "react-icons/fi";
import type { IconType } from "react-icons";
import styles from "../css/MoneyTree.module.css";
import { dateFormat } from "../utils/dates";

/**
 * Which mark a leaf's state carries. Each one differs in SHAPE as well as in
 * colour, so the phone's icon-only state (see `MoneyTree`) still tells them
 * apart: ✓ it happened · ! its day is here · ⚠ late · ◷ still to come ·
 * ⚑ it starts here.
 */
export type TreeLeafStateKind = "done" | "due" | "late" | "coming" | "first";

const STATE_ICON: Record<TreeLeafStateKind, IconType> = {
  done: FiCheck,
  due: FiAlertCircle,
  late: FiAlertTriangle,
  coming: FiClock,
  first: FiFlag,
};

/** What a leaf's state says: the mark, the word, and anything beside it («σε 3 μέρες»). */
export interface TreeLeafState {
  kind: TreeLeafStateKind;
  /** The word. Always in the accessible name; shown as a word from 576px up. */
  word: string;
  /** Beside the word — «σε 3 μέρες». Shown from 576px up; on a phone it stays in the accessible name. */
  extra?: string;
}

/** One thing on a day: a leaf of the tree. */
export interface TreeLeaf {
  id: string;
  direction: "in" | "out";
  label: string;
  /** Always positive: `direction` says which way. */
  amount: number;
  icon?: string;
  /** Beside the figure: its state, with the mark the kind gives it. */
  state?: TreeLeafState;
  /** Beside the figure where there is no state: its category — whatever the page says of it. */
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
 * A leaf reads down, not across (owner, 2026-11-24, «option Β»): the name on a
 * line of its own, and under it the state on the left and the figure on the
 * right, bigger and bold. Side by side, the name had a third of a 320px leaf
 * and «Ενοίκιο γκαρσονιέρας» broke mid-word; now nothing wraps mid-word and
 * nothing is cut. The ↙/↗ direction mark is gone with it — the sign and the
 * colour already say which way the money went — but its word stays in the
 * accessible name.
 *
 * **The phone shows the state as an ICON alone** (owner, 2026-11-24). Rule 14
 * of `.claude/rules/ui.md` is «icon + word, never colour alone»; this is its
 * one exception, and only under 576px («μόνο icons εννοώ στο κινητό, στο pc ας
 * φαίνεται κανονικά το text»). The word is never removed, only clipped
 * (`MoneyTree.module.css`), so a screen reader and the tooltip still say it,
 * and each mark differs in shape as well as colour (see `TreeLeafStateKind`).
 *
 * One side rule, in every tree in the app: money in grows to the LEFT of the
 * trunk and money out to the RIGHT — even in a tree of one kind, so a
 * bills-only tree hangs everything right and an incomes-only one everything
 * left. The side itself says in or out at a glance, before the colour and the
 * sign do. (One-sided trees used to let the days take turns, which made the
 * side mean nothing.) On a phone, or in a narrow column, the trunk moves to
 * the left edge and every leaf hangs to its right; there the sign and the
 * colour of the figure carry what the side no longer can.
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
    const StateIcon = item.state ? STATE_ICON[item.state.kind] : undefined;
    const direction = t(item.direction === "in" ? "timeline.dirIn" : "timeline.dirOut");
    const body = (
      <>
        <span className={styles.leafHead}>
          {item.icon && (
            <span className={styles.leafIcon} aria-hidden>
              {item.icon}
            </span>
          )}
          <span className={styles.leafName}>{item.label}</span>
        </span>
        <span className={styles.leafFoot}>
          {item.state && StateIcon ? (
            <span className={styles.leafState} title={`${item.state.word}${item.state.extra ? ` · ${item.state.extra}` : ""}`}>
              <StateIcon size={12} aria-hidden />
              {/* Clipped under 576px, never dropped: the word stays the state's name. */}
              <span className={styles.stateWord}>{item.state.word}</span>
              {item.state.extra && <span className={styles.stateExtra}>{` · ${item.state.extra}`}</span>}
            </span>
          ) : (
            item.note && <span className={styles.leafNote}>{item.note}</span>
          )}
          <span className={styles.leafAmount}>
            {item.neutral ? "" : item.direction === "in" ? "+" : "−"}
            {item.approximate ? "≈" : ""}
            {formatCurrency(item.amount)}
            {/* The arrow is gone; the way the money went is still spoken. */}
            {!item.neutral && <span className="visually-hidden">{` ${direction}`}</span>}
          </span>
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
