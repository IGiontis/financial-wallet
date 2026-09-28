import type { ReactNode } from "react";
import { FiCheck } from "react-icons/fi";
import { CARD_FINISH, type CardColor } from "./accountTones";
import styles from "./css/BankCard.module.css";

/**
 * One account, drawn small and plain: a card for a bank, a banknote for cash.
 *
 * The same drawing on the Banks & cash page and in the step of the transaction
 * form that asks where the money came from, so the card you pick is the card
 * you see your balance on.
 */
export function BankCard({
  name,
  kind,
  finish,
  amount,
  note,
  badge,
  selected,
  compact,
  onClick,
  label,
  children,
}: {
  name: string;
  kind: "bank" | "cash";
  finish: CardColor | "cash";
  amount?: string;
  note?: string;
  badge?: string;
  selected?: boolean;
  /** Name and balance only, no chip: smaller still, for a row of several. */
  compact?: boolean;
  onClick?: () => void;
  /** For a screen reader, when the card is a button. */
  label?: string;
  /** Laid over the card — a delete button in edit mode. */
  children?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": selected, "aria-label": label } : {})}
      className={`${styles.card} ${kind === "cash" ? styles.cash : ""} ${selected ? styles.selected : ""} ${compact ? styles.compact : ""}`}
      style={kind === "cash" ? undefined : { ["--card" as string]: CARD_FINISH[finish].background }}
    >
      <span className={styles.top}>
        <span className={styles.name}>{name}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </span>
      {!compact && (kind === "cash" ? <span className={styles.seal}>€</span> : <span className={styles.chip} aria-hidden />)}
      <span className={styles.bottom}>
        <span className={styles.amount}>{amount}</span>
        {note && <span className={styles.note}>{note}</span>}
      </span>
      {selected && (
        <span className={styles.check} aria-hidden>
          <FiCheck size={13} strokeWidth={3} />
        </span>
      )}
      {children}
    </Tag>
  );
}

/** "No particular card": the empty choice, drawn as the outline of a card. A picture only, without `onClick`. */
export function NoCard({ title, hint, selected, compact, onClick }: { title: string; hint?: string; selected?: boolean; compact?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": selected } : {})}
      className={`${styles.card} ${styles.none} ${selected ? styles.selected : ""} ${compact ? styles.compact : ""}`}
    >
      <span className={styles.name}>{title}</span>
      {hint && <span className={styles.noneHint}>{hint}</span>}
      {selected && (
        <span className={styles.check} aria-hidden>
          <FiCheck size={13} strokeWidth={3} />
        </span>
      )}
    </Tag>
  );
}
