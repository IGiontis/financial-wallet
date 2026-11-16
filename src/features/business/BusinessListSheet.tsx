import type { ReactNode } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { firestoreToDate, dateFormat } from "../../shared/utils/dates";
import type { BusinessEntry } from "../../shared/types/IndexTypes";
import { profitTone, signed } from "./businessFormat";
import styles from "./css/Business.module.css";
import calendarStyles from "../calendar/css/CalendarPage.module.css";

export interface BusinessSheetRow {
  entry: BusinessEntry;
  /** The figure on the right: a day's profit (signed), or what it paid on a line. */
  amount: number;
  /** Lines under the business's name — the day's turnover and expenses, say. */
  meta?: ReactNode;
  /** A day that closed at a loss: marked in words, not only in red. */
  loss?: boolean;
}

/**
 * A list of closings behind a figure of the overview — the month's days, or
 * where an expense line's amount came from — to read, not to change: each row
 * opens the closing's own view (`BusinessEntryView`), which stays over the list.
 * The rows are the «Μέρες» tab's; the sum at the foot is the calendar day
 * sheet's, and it is the figure that was tapped. A view: it closes on the
 * backdrop, as the ledger's category list does.
 */
export function BusinessListSheet({
  title,
  icon,
  sub,
  rows,
  total,
  totalLabel,
  signedFigures,
  businessName,
  formatCurrency,
  onOpen,
  onClose,
}: {
  title: string;
  icon: string;
  /** Under the title: how many, of which month — and what the list is. */
  sub: ReactNode;
  rows: readonly BusinessSheetRow[];
  total: number;
  totalLabel: string;
  /** Profits and losses carry a sign and their colour; a line's amounts are plain, as on its bar. */
  signedFigures: boolean;
  /** Which business a row is — only when the page shows all of them. */
  businessName?: (entry: BusinessEntry) => string;
  formatCurrency: (n: number) => string;
  onOpen: (entry: BusinessEntry) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const weekday = dateFormat("weekdayShort", lang);
  const spokenDay = dateFormat("dayMonthWeekday", lang);
  const figure = (n: number) => (signedFigures ? signed(n, formatCurrency) : formatCurrency(n));
  // A line's amounts are written as its bar writes them: plain, no sign, no colour.
  const tone = (n: number) => (signedFigures ? profitTone(n, styles) : "");

  return (
    <Modal isOpen toggle={onClose} centered scrollable size="sm">
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          <span aria-hidden>{icon}</span>
          {title}
        </span>
      </ModalHeader>
      <ModalBody className="pt-2">
        <div className={styles.sheetSub}>{sub}</div>
        <ul className={styles.rows}>
          {rows.map(({ entry, amount, meta, loss }) => {
            const at = firestoreToDate(entry.date);
            const name = businessName?.(entry);
            const spoken = [name, spokenDay.format(at), loss ? t("business.loss") : "", figure(amount)].filter(Boolean).join(", ");
            return (
              <li key={entry.id} className={styles.row}>
                <button type="button" className={styles.rowMain} onClick={() => onOpen(entry)} aria-label={spoken}>
                  <span className={styles.rowDay} aria-hidden>
                    <strong>{at.getDate()}</strong>
                    {weekday.format(at)}
                  </span>
                  <span className={styles.rowText} aria-hidden>
                    {name && <span className={styles.rowBusiness}>{name}</span>}
                    {meta}
                  </span>
                  <span className={`${styles.rowAmount} ${tone(amount)}`} aria-hidden>
                    {loss && <span className={styles.lossTag}>{t("business.lossDayTag")}</span>}
                    {figure(amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className={`${calendarStyles.sheetNet} mt-2`}>
          <span>{totalLabel}</span>
          <strong className={tone(total)}>{figure(total)}</strong>
        </div>
      </ModalBody>
    </Modal>
  );
}
