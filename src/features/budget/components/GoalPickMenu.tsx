import { FiCheck, FiChevronDown } from "react-icons/fi";
import type { IconType } from "react-icons";
import { RowMenu } from "../../../shared/components/RowMenu";
import styles from "./css/GoalsWorkbench.module.css";

// A small «Όλοι ▾» button beside a tab's search, opening the choices under it.
//
// It replaced a strip of status tabs with counts — «Όλοι 4 · Σε παύση 1 ·
// Ολοκληρωμένοι 0» — that took a row of its own for a choice made once in a
// while. The counts are still there, in the menu, beside each choice. The menu
// itself is the app's row menu (Floating UI, on the body), so a card edge or a
// sticky bar can never clip it.

export interface PickOption {
  id: string;
  label: string;
  /** How many goals the choice keeps; left out where a count means nothing. */
  count?: number;
}

export function GoalPickMenu({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  compact = false,
}: {
  /** What the choice is about — said with the current choice to a screen reader. */
  label: string;
  value: string;
  options: PickOption[];
  onChange: (id: string) => void;
  icon?: IconType;
  /** On a phone, the icon alone stands for the button's words. */
  compact?: boolean;
}) {
  const current = options.find((option) => option.id === value) ?? options[0];

  return (
    <RowMenu
      label={`${label}: ${current?.label ?? ""}`}
      className={styles.pickToggle}
      entries={options.map((option) => ({
        label: option.count === undefined ? option.label : `${option.label} (${option.count})`,
        onSelect: () => onChange(option.id),
        icon: option.id === value ? <FiCheck size={15} aria-hidden /> : <span className={styles.pickSpacer} aria-hidden />,
      }))}
    >
      {Icon && <Icon size={15} aria-hidden />}
      <span className={compact && Icon ? "d-none d-sm-inline" : undefined}>{current?.label}</span>
      <FiChevronDown size={14} aria-hidden />
    </RowMenu>
  );
}
