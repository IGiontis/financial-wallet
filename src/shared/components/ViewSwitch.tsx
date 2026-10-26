import type { IconType } from "react-icons";
import styles from "../css/ViewSwitch.module.css";

export interface ViewSwitchOption<T extends string> {
  id: T;
  label: string;
  icon?: IconType;
}

/**
 * Two or three ways of looking at the same thing — «Λίστα | Ημερολόγιο»,
 * «Κάρτες | Λίστα», «Διάστημα | Μήνας». A page's own tabs fill the width and
 * change what the page is about; this is small, sized to its words, and only
 * changes how the same rows are laid out. Drawn alike, the two were mistaken
 * for one another, so this one is deliberately the quieter of the two.
 *
 * `iconOnlyOnPhone` keeps a switch that sits beside a button to its icons on a
 * phone; each keeps its name for screen readers. `block` stretches it across
 * its row, the options sharing it equally — for a switch that leads a card.
 */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  iconOnlyOnPhone,
  block,
  className,
}: {
  label: string;
  options: readonly ViewSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  iconOnlyOnPhone?: boolean;
  block?: boolean;
  className?: string;
}) {
  return (
    <div className={`${styles.switch} ${block ? styles.block : ""} ${className ?? ""}`} role="group" aria-label={label}>
      {options.map(({ id, label: name, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`${styles.option} ${value === id ? styles.on : ""}`}
          aria-pressed={value === id}
          aria-label={iconOnlyOnPhone ? name : undefined}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={13} aria-hidden />}
          <span className={iconOnlyOnPhone ? "d-none d-sm-inline" : undefined}>{name}</span>
        </button>
      ))}
    </div>
  );
}

export default ViewSwitch;
