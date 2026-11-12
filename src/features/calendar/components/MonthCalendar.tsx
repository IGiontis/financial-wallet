import { useMemo, useState, type ReactNode } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { addMonths, endOfMonth, isSameDay, startOfMonth } from "date-fns";
import { MonthPicker } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useNarrowScreen } from "../../../shared/hooks/useNarrowScreen";
import { dayTone, type DayToneInput } from "../dayTone";
import styles from "../css/CalendarPage.module.css";

// The month as the «Ημερολόγιο» page draws it — the header with its way to
// other months, the month's in and out, the weekdays and the grid of days, and
// the chosen day's list (under the month on a phone, in a dialog on a wider
// screen). Every calendar that wants to look like that one draws it with this,
// and says only what is on each day and what its list holds.

/** What one day of the month shows. */
export interface MonthDay {
  /** Its colours, in the calendars' shared language — see `dayTone`. */
  look: Omit<DayToneInput, "today" | "selected" | "swatch">;
  /** The figure inside it, signed; `null` for a day with nothing to add up. */
  net: number | null;
  /** What is on it, for a screen reader: "Rent −500,00 €, Salary +1.200,00 €". */
  spoken: string;
}

/** Below a tablet: the day's list sits under the month instead of in a dialog. */
const PHONE_QUERY = "(max-width: 767.98px)";

export interface MonthCalendarProps {
  month: Date;
  onMonthChange: (month: Date) => void;
  now: Date;
  /** The first and last months one can step to. */
  first: Date;
  last: Date;
  /** The month's heading level: the page's own title, or a heading inside a page. */
  titleAs?: "h1" | "h2";
  /** Under the header: what the calendar is made of, and its key. */
  scope?: ReactNode;
  /** The two tiles: money in and money out, each with an optional line under the figure. */
  totals: { in: number; out: number; inSub?: ReactNode; outSub?: ReactNode };
  dayOf: (date: Date) => MonthDay | undefined;
  /** The chosen day's list; `null` when there is nothing on it. `onLeave` closes the dialog. */
  renderDay: (date: Date, onLeave?: () => void) => ReactNode | null;
  /** What an empty day says. */
  emptyDay: string;
  /** For the guided tour: the grid's `data-tour`. */
  "data-tour"?: string;
  /** The tapped day, when the page keeps it (so it outlives this view); kept here when left out. */
  picked?: Date | null;
  onPick?: (day: Date | null) => void;
}

export function MonthCalendar({ month, onMonthChange, now, first, last, titleAs: Title = "h1", scope, totals, dayOf, renderDay, emptyDay, "data-tour": gridTour, picked: pickedFromPage, onPick }: MonthCalendarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  // A phone reads the chosen day in a list under the month — today's, until
  // another is tapped. A tablet or a desk opens it in a dialog, only when tapped.
  const phone = useNarrowScreen(PHONE_QUERY);
  const [pickedHere, setPickedHere] = useState<Date | null>(null);
  const picked = onPick ? (pickedFromPage ?? null) : pickedHere;
  const setPicked = onPick ?? setPickedHere;
  const selected = picked ?? (phone && isSameDay(month, startOfMonth(now)) ? now : null);

  const goTo = (next: Date) => {
    onMonthChange(next);
    setPicked(null);
  };

  const monthTitle = useMemo(() => new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(month), [lang, month]);
  const dayTitle = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }), [lang]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i))), [lang]);
  // Whole euros in a cell, signed. A desk's cell has room for the currency, and
  // it comes from the page's own formatter so it converts like every other
  // figure; a phone's is about 48px, where the figure goes without it and
  // thousands as 1,45k. The cents are the sheet's.
  const withCurrency = (n: number) => formatCurrency(Math.round(Math.abs(n))).replace(/[.,]00(?!\d)/, "");
  const plain = useMemo(() => {
    const whole = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    const thousands = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
    return (n: number) => (Math.abs(n) >= 1000 ? `${thousands.format(Math.round(Math.abs(n) / 10) / 100)}k` : whole.format(Math.abs(n)));
  }, [lang]);

  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const total = Math.ceil((lead + length) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - lead + 1));
  }, [month]);

  const atStart = month <= first;
  const atEnd = month >= last;
  const thisMonth = isSameDay(month, startOfMonth(now));
  const selectedList = selected ? renderDay(selected, phone ? undefined : () => setPicked(null)) : null;

  return (
    <>
      <div className={styles.head}>
        <button type="button" className={styles.nav} onClick={() => goTo(addMonths(month, -1))} disabled={atStart} aria-label={t("calendar.prev")}>
          <FiChevronLeft aria-hidden />
        </button>
        <div className={styles.title}>
          {/* The title is the way to any month and year: it opens the grid of months. */}
          <MonthPicker
            value={month}
            onChange={goTo}
            minDate={first}
            maxDate={endOfMonth(last)}
            className={styles.titleButton}
            // The month too: a label alone would hide the title it is written on.
            label={`${monthTitle} · ${t("calendar.pickMonth")}`}
            caption={
              <>
                <Title className="h5 fw-semibold text-body-emphasis mb-0">{monthTitle}</Title>
                <FiChevronDown size={16} aria-hidden />
              </>
            }
          />
          {!thisMonth && (
            <button type="button" className={styles.todayLink} onClick={() => goTo(startOfMonth(now))}>
              {t("calendar.today")}
            </button>
          )}
        </div>
        <button type="button" className={styles.nav} onClick={() => goTo(addMonths(month, 1))} disabled={atEnd} aria-label={t("calendar.next")}>
          <FiChevronRight aria-hidden />
        </button>
      </div>

      {scope && <div className={styles.scopeRow}>{scope}</div>}

      <div className={styles.totals}>
        <span className={`${styles.totalIn} tone-tile tone-tile-income`}>
          <span className={styles.totalLabel}>{t("calendar.in")}</span>
          <strong>{formatCurrency(totals.in)}</strong>
          {totals.inSub && <span className={styles.totalSub}>{totals.inSub}</span>}
        </span>
        <span className={`${styles.totalOut} tone-tile tone-tile-expense`}>
          <span className={styles.totalLabel}>{t("calendar.out")}</span>
          <strong>{formatCurrency(totals.out)}</strong>
          {totals.outSub && <span className={styles.totalSub}>{totals.outSub}</span>}
        </span>
      </div>

      <div className={styles.weekdays} aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      <div className={styles.grid} role="group" aria-label={monthTitle} data-tour={gridTour}>
        {cells.map((date) => {
          const inside = date.getMonth() === month.getMonth();
          if (!inside) return <span key={date.toISOString()} className={styles.outside} aria-hidden />;
          const day = dayOf(date);
          const isSelected = !!selected && isSameDay(date, selected);
          const net = day?.net ?? null;
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`${styles.day} ${dayTone({ ...(day?.look ?? {}), today: isSameDay(date, now), selected: isSelected })}`}
              aria-pressed={isSelected}
              onClick={() => setPicked(date)}
              aria-label={`${dayTitle.format(date)}${day?.spoken ? ` · ${day.spoken}` : ""}`}
            >
              <span className={styles.num}>{date.getDate()}</span>
              {net !== null && (
                <span className={`${styles.net} ${net > 0 ? styles.netPos : net < 0 ? styles.netNeg : ""}`}>
                  <span className={styles.signMark}>{net > 0 ? "+" : net < 0 ? "−" : ""}</span>
                  <span className={styles.withCurrency}>{withCurrency(net)}</span>
                  <span className={styles.plain}>{plain(net)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* On a phone the day's list is under the month rather than in a dialog
          over it: there is room for it, and the month stays in sight. */}
      {phone && (
        <section className={styles.dayPanel} aria-live="polite">
          {!selected ? (
            <p className={styles.dayHint}>{t("calendar.pickDay")}</p>
          ) : (
            <>
              <div className={styles.dayPanelTitle}>{dayTitle.format(selected)}</div>
              {selectedList ?? <p className={styles.dayHint}>{emptyDay}</p>}
            </>
          )}
        </section>
      )}

      {/* A tablet or a desk: the day in a dialog, as it was. */}
      {!phone && selected && (
        <Modal isOpen toggle={() => setPicked(null)} centered scrollable>
          <ModalHeader toggle={() => setPicked(null)}>
            <span style={{ fontSize: "var(--fs-lead)", textTransform: "capitalize" }}>{dayTitle.format(selected)}</span>
          </ModalHeader>
          <ModalBody>{selectedList ?? <p className={styles.dayHint}>{emptyDay}</p>}</ModalBody>
        </Modal>
      )}
    </>
  );
}
