import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, DropdownMenu, DropdownToggle } from "reactstrap";
import styles from "./css/DayPicker.module.css";

/** The days of a month to pick from, 1–31: a day a month lacks falls on its last. */
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * The day of the month, picked from a small calendar-like grid instead of a
 * 31-row dropdown: 7 columns, 1–31, the chosen day in the brand colour.
 *
 * The stored value is the same number the dropdown stored — there is no
 * separate «last day» value in the model; 31 already falls on the last day of
 * a shorter month (see `billsUtils`), and its label says so.
 *
 * Keyboard: the button opens the grid on the chosen day (or 1); arrows move a
 * day / a week, Home / End go to 1 / 31, Enter or Space pick, Escape closes
 * and gives focus back to the button. Screen readers hear a listbox of days.
 */
export function DayPicker({
  id,
  value,
  onChange,
  invalid = false,
  clearable = false,
  disabled = false,
  "aria-labelledby": labelledBy,
}: {
  id?: string;
  /** "" (not chosen yet) or a day 1–31, as a number or the string a select gave. */
  value: number | string;
  onChange: (day: string) => void;
  invalid?: boolean;
  /** Offer «Χωρίς μέρα» for a day that is optional. */
  clearable?: boolean;
  disabled?: boolean;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const chosen =
    Number(value) >= 1 && Number(value) <= 31 ? Number(value) : undefined;
  const [focus, setFocus] = useState(chosen ?? 1);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  // The dialog closes on Escape's key-UP: the one that closed the grid must not also close the form.
  const swallowEscapeUp = useRef(false);

  // Opening lands on the chosen day, so one Enter keeps it.
  useEffect(() => {
    if (!open) return;
    // The menu is in the DOM once open; focus after it has rendered.
    const frame = requestAnimationFrame(() =>
      cells.current[(chosen ?? 1) - 1]?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, chosen]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggleRef.current?.focus();
  };

  const pick = (day: number | "") => {
    onChange(day === "" ? "" : String(day));
    close(true);
  };

  const move = (to: number) => {
    const day = Math.min(31, Math.max(1, to));
    setFocus(day);
    cells.current[day - 1]?.focus();
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) move(focus + step[e.key]);
    else if (e.key === "Home") move(1);
    else if (e.key === "End") move(31);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      swallowEscapeUp.current = true;
      return close(true);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const label = (day: number) =>
    day === 31 ? t("common.dayPickerLast") : t("common.dayPickerDay", { day });

  return (
    <Dropdown
      isOpen={open}
      toggle={() => {
        // Opening lands on the chosen day, so one Enter keeps it.
        if (!open) setFocus(chosen ?? 1);
        setOpen((o) => !o);
      }}
      disabled={disabled}
      className={styles.wrap}
      onKeyUp={(e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "Escape" || !swallowEscapeUp.current) return;
        swallowEscapeUp.current = false;
        e.stopPropagation();
      }}
    >
      <DropdownToggle
        id={id}
        innerRef={toggleRef}
        tag="button"
        type="button"
        caret
        disabled={disabled}
        className={`form-select text-start ${styles.toggle} ${invalid ? "is-invalid" : ""}`}
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
      >
        {chosen ?? (
          <span className="text-body-secondary">
            {t("common.dayPickerChoose")}
          </span>
        )}
      </DropdownToggle>
      <DropdownMenu className={styles.menu}>
        {/* Only while open: closed, the 31 days are not in the page at all. */}
        {open && (
          <>
            <div
              role="listbox"
              aria-label={t("common.dayPickerChoose")}
              className={styles.grid}
              onKeyDown={onGridKey}
            >
              {DAYS.map((day) => (
                <button
                  key={day}
                  ref={(el) => {
                    cells.current[day - 1] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={day === chosen}
                  aria-label={label(day)}
                  title={day === 31 ? label(day) : undefined}
                  tabIndex={day === focus ? 0 : -1}
                  className={`${styles.day} ${day === chosen ? styles.chosen : ""}`}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              ))}
            </div>
            {clearable && (
              <button
                type="button"
                className={`btn btn-link btn-sm ${styles.clear}`}
                onClick={() => pick("")}
              >
                {t("common.dayPickerNone")}
              </button>
            )}
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
}
