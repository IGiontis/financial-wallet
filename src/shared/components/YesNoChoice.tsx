import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./css/YesNoChoice.module.css";

/**
 * A yes / no question inside a wizard step, asked as two big tiles instead of
 * a switch — switches were not understood («είναι ενεργό;» read as a setting
 * already applied, not a question to answer).
 *
 * Nothing is pre-picked unless the caller passes a value: `undefined` means
 * "not answered yet". Picking «Ναι» shows `children` right under the tiles,
 * in the same step; picking «Όχι» shows `whenNo` (usually nothing) and the
 * wizard simply moves on.
 *
 * Radio-group semantics: one tab stop for the pair (the picked tile, or the
 * first when none is), arrows move AND pick like native radios, Space / Enter
 * pick the focused tile.
 */
export function YesNoChoice({
  question,
  hideQuestion = false,
  value,
  onChange,
  yesLabel,
  noLabel,
  yesHint,
  noHint,
  children,
  whenNo,
  disabled = false,
  className = "mb-3",
}: {
  /** The question; it labels the group even when hidden. */
  question: ReactNode;
  /** The step already asks it as its title: keep it for screen readers only. */
  hideQuestion?: boolean;
  /** true = «Ναι», false = «Όχι», undefined = not answered yet. */
  value: boolean | undefined;
  onChange: (yes: boolean) => void;
  yesLabel?: ReactNode;
  noLabel?: ReactNode;
  yesHint?: ReactNode;
  noHint?: ReactNode;
  /** Shown under the tiles only while «Ναι» is picked. */
  children?: ReactNode;
  /** Shown under the tiles only while «Όχι» is picked. */
  whenNo?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const questionId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (yes: boolean) => {
    if (!disabled) onChange(yes);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, yes: boolean) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    // Two options: every arrow lands on the other one.
    const next = !yes;
    refs.current[next ? 0 : 1]?.focus();
    pick(next);
  };

  const tile = (yes: boolean) => {
    const on = value === yes;
    // One tab stop: the picked tile, or «Ναι» while nothing is picked.
    const tabbable = value === undefined ? yes : on;
    const label = yes ? (yesLabel ?? t("common.yes")) : (noLabel ?? t("common.no"));
    const hint = yes ? yesHint : noHint;
    return (
      <button
        ref={(el) => {
          refs.current[yes ? 0 : 1] = el;
        }}
        type="button"
        role="radio"
        aria-checked={on}
        // The hint is read with its answer, though only the picked one's shows.
        aria-describedby={hint ? hintId(yes) : undefined}
        tabIndex={tabbable ? 0 : -1}
        disabled={disabled}
        className={`${styles.option} ${on ? styles.on : ""}`}
        onClick={() => pick(yes)}
        onKeyDown={(e) => onKeyDown(e, yes)}
      >
        {label}
      </button>
    );
  };
  const hintId = (yes: boolean) => `${questionId}-${yes ? "yes" : "no"}-hint`;
  const hint = (yes: boolean) => {
    const text = yes ? yesHint : noHint;
    if (!text) return null;
    // Small, under the pair, and only the picked answer's — the other stays
    // in the tree (hidden) so its button can still be described by it.
    return (
      <div id={hintId(yes)} className={value === yes ? styles.hint : "visually-hidden"}>
        {text}
      </div>
    );
  };

  return (
    <div className={className}>
      <div id={questionId} className={hideQuestion ? "visually-hidden" : "small fw-medium mb-2"}>
        {question}
      </div>
      <div className={styles.group} role="radiogroup" aria-labelledby={questionId}>
        {tile(true)}
        {tile(false)}
      </div>
      {hint(true)}
      {hint(false)}
      {value === true && children !== undefined && <div className="mt-3">{children}</div>}
      {value === false && whenNo !== undefined && <div className="mt-3">{whenNo}</div>}
    </div>
  );
}
