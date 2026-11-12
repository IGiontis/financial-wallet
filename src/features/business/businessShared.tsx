import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { addMonths } from "date-fns";
import { MonthPicker } from "../../shared/components/DateField";
import { monthStart } from "./businessSummary";
import styles from "./css/Business.module.css";

/**
 * The month on show, and the way to the others: ‹ the month (a tap opens the
 * grid of months) › — the Calendar's header, for this page. Not past this
 * month: nothing is written ahead of time here.
 */
export function MonthNav({ month, onChange, first, now }: { month: Date; onChange: (month: Date) => void; first: Date; now: Date }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const title = useMemo(() => new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(month), [lang, month]);
  const current = monthStart(now);
  const atStart = month.getTime() <= monthStart(first).getTime();
  const atEnd = month.getTime() >= current.getTime();

  return (
    <div className={styles.monthHead}>
      <button type="button" className={styles.monthNav} onClick={() => onChange(addMonths(month, -1))} disabled={atStart} aria-label={t("business.prevMonth")}>
        <FiChevronLeft aria-hidden />
      </button>
      <div className={styles.monthTitle}>
        <MonthPicker
          value={month}
          onChange={(m) => onChange(monthStart(m))}
          minDate={monthStart(first)}
          maxDate={current}
          className={styles.monthButton}
          label={`${title} · ${t("business.pickMonth")}`}
          caption={
            <>
              <h2 className="h5 fw-semibold text-body-emphasis mb-0">{title}</h2>
              <FiChevronDown size={16} aria-hidden />
            </>
          }
        />
        {!atEnd && (
          <button type="button" className={styles.todayLink} onClick={() => onChange(current)}>
            {t("business.thisMonth")}
          </button>
        )}
      </div>
      <button type="button" className={styles.monthNav} onClick={() => onChange(addMonths(month, 1))} disabled={atEnd} aria-label={t("business.nextMonth")}>
        <FiChevronRight aria-hidden />
      </button>
    </div>
  );
}
