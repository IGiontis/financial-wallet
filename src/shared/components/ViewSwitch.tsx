import type { CSSProperties, ReactNode } from "react";
import type { IconType } from "react-icons";
import styles from "../css/ViewSwitch.module.css";

export interface ViewSwitchOption<T extends string> {
  id: T;
  label: string;
  icon?: IconType;
  /**
   * What it shows on the narrowest phones in place of its icon and name —
   * an icon with a figure, «📅7» for a week. The name stays for screen
   * readers and as the tooltip. Only with `short` on every option.
   */
  short?: ReactNode;
}

/**
 * Two or three ways of looking at the same thing — «Λίστα | Ημερολόγιο»,
 * «Κάρτες | Λίστα», «Διάστημα | Μήνας». A page's own tabs fill the width and
 * change what the page is about; this is small, sized to its words, and only
 * changes how the same rows are laid out. Drawn alike, the two were mistaken
 * for one another, so this one is deliberately the quieter of the two.
 *
 * `stackOnPhone` is for a switch of several views: on a phone it fills its
 * row, each option its icon above its name, tall enough for a thumb. It used
 * to keep to its icons there, and nobody could tell them apart. Up to four sit
 * on one row; more go on two even rows (six as three and three), since a strip
 * scrolling sideways hid the ones past the edge. A name too long for its share
 * breaks onto a second line.
 * `block` stretches it across its row, the options sharing it equally — for
 * a switch that leads a card.
 */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  stackOnPhone,
  block,
  className,
  "data-tour": tourMark,
}: {
  label: string;
  options: readonly ViewSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  stackOnPhone?: boolean;
  block?: boolean;
  className?: string;
  /**
   * A mark for the demo's guided tour (see `demo/guidedTour`): a step whose
   * element shows in one of these views only presses the option it needs,
   * found by its `data-view`, before pointing — the view chosen last is
   * remembered on the device, and may be the other one.
   */
  "data-tour"?: string;
}) {
  return (
    <div
      className={`${styles.switch} ${block ? styles.block : ""} ${stackOnPhone ? styles.stack : ""} ${options.every((o) => o.short) ? styles.tiny : ""} ${className ?? ""}`}
      style={stackOnPhone ? ({ "--stack-columns": options.length <= 4 ? options.length : Math.ceil(options.length / 2) } as CSSProperties) : undefined}
      role="group"
      aria-label={label}
      data-tour={tourMark}
    >
      {options.map(({ id, label: name, icon: Icon, short }) => (
        <button
          key={id}
          type="button"
          data-view={id}
          className={`${styles.option} ${value === id ? styles.on : ""}`}
          aria-pressed={value === id}
          title={short ? name : undefined}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={13} aria-hidden />}
          <span className={styles.name}>{name}</span>
          {short && (
            <span className={styles.short} aria-hidden>
              {short}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default ViewSwitch;
