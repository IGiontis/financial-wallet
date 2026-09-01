import { forwardRef } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { useTranslation } from "react-i18next";
import { el, enUS } from "date-fns/locale";
import { FiCalendar } from "react-icons/fi";
import { parseISODay, toISODay } from "../utils/dates";
import styles from "./css/DateField.module.css";

// Registered once at module load — react-datepicker resolves locales by name.
registerLocale("el", el);
registerLocale("en", enUS);

interface DateFieldProps {
  /** ISO day string (yyyy-MM-dd), or "" when empty — the shape the forms already hold. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  name?: string;
  id?: string;
  /** Matches Bootstrap's form-control-sm. */
  small?: boolean;
  /** Lets the field be cleared back to "". Off by default: most are required. */
  clearable?: boolean;
}

/**
 * The visible control. A button rather than an input: the calendar is the only
 * way to change the value, so a text cursor would promise editing that isn't
 * there.
 */
const DateButton = forwardRef<HTMLButtonElement, { value?: string; onClick?: () => void; placeholder?: string; invalid?: boolean; disabled?: boolean; small?: boolean; id?: string }>(
  ({ value, onClick, placeholder, invalid, disabled, small, id }, ref) => (
    <button
      type="button"
      id={id}
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={`form-control ${small ? "form-control-sm" : ""} ${styles.control} ${invalid ? "is-invalid" : ""}`}
    >
      <span className={value ? undefined : styles.placeholder}>{value || placeholder || "—"}</span>
      <FiCalendar size={small ? 13 : 15} className={styles.icon} aria-hidden />
    </button>
  ),
);
DateButton.displayName = "DateButton";

/**
 * Every date field in the app.
 *
 * Replaces `<input type="date">`, which looks native and therefore behaves
 * differently everywhere: on a desktop browser the calendar only opens from a
 * small icon at the right-hand edge — a target you have to aim at, on a field
 * that otherwise looks clickable — and the text half accepts typing in whatever
 * order the OS locale decided. One component instead gives the same calendar,
 * the same Greek month names and the same dark theme on every screen, and the
 * whole field opens it.
 *
 * The value stays an ISO day string rather than a `Date`, so this drops into
 * the Formik forms that already store dates that way — no conversion at every
 * call site, and no timezone drift from round-tripping through `Date`.
 */
export function DateField({ value, onChange, onBlur, invalid, disabled, placeholder, minDate, maxDate, name, id, small, clearable }: DateFieldProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("el") ? "el" : "en";

  return (
    <DatePicker
      selected={parseISODay(value)}
      onChange={(date: Date | null) => onChange(date ? toISODay(date) : "")}
      onBlur={onBlur}
      locale={locale}
      dateFormat="dd MMM yyyy"
      minDate={minDate}
      maxDate={maxDate}
      name={name}
      disabled={disabled}
      isClearable={clearable}
      showPopperArrow={false}
      // Portalled so the calendar is never clipped by a modal body's overflow,
      // which is where most of these fields live.
      portalId="datepicker-portal"
      popperPlacement="bottom-start"
      customInput={<DateButton placeholder={placeholder} invalid={invalid} small={small} id={id} />}
      calendarClassName={styles.calendar}
    />
  );
}
