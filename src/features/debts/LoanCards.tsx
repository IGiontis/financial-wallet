import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiPlus } from "react-icons/fi";
import { firestoreToDate } from "../../shared/utils/dates";
import { loanState } from "./debtsUtils";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/DebtsPage.module.css";

/** How much of the debt is gone — not how much has been handed over. */
function clearedShare(debt: DebtWithStatus): number {
  if (debt.amount <= 0) return 0;
  const loan = loanState(debt);
  const cleared = loan ? debt.amount - loan.balance : debt.paid;
  return Math.min(Math.max((cleared / debt.amount) * 100, 0), 100);
}

/**
 * Every loan with one person, one card under another.
 *
 * For "what have I taken from Εθνική" at a glance: on the left what the loan
 * is, when it began and when it was last paid; on the right what is left, how
 * much of it is gone, and the button to pay it. Only ever scrolled up and
 * down, with room between the cards so a tap lands on the right one.
 *
 * Tapping the left half opens that loan one at a time, where its payments are.
 */
export function LoanCards({
  loans,
  formatCurrency,
  locale,
  onOpen,
  onRecord,
}: {
  loans: DebtWithStatus[];
  formatCurrency: (n: number) => string;
  locale: string;
  onOpen: (debt: DebtWithStatus) => void;
  onRecord: (debt: DebtWithStatus) => void;
}) {
  const { t } = useTranslation();
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // This year goes without saying, and with it the line fits beside the button.
  const thisYearFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  /** The last payment's day, and the time it was written down when that was the same day. */
  const lastPaid = (debt: DebtWithStatus) => {
    const last = debt.payments[0];
    if (!last) return undefined;
    const day = firestoreToDate(last.date);
    const created = last.createdAt ? firestoreToDate(last.createdAt) : undefined;
    const sameDay = created && !Number.isNaN(created.getTime()) && created.toDateString() === day.toDateString();
    const date = (day.getFullYear() === new Date().getFullYear() ? thisYearFmt : dayFmt).format(day);
    return sameDay ? `${date} · ${timeFmt.format(created)}` : date;
  };

  return (
    <ul className={styles.cards} aria-label={t("debts.pickerLabel")}>
      {loans.map((debt) => {
        const borrowed = debt.direction === "owed_by_me";
        const tone = debt.isSettled ? "var(--color-text-secondary)" : borrowed ? "var(--color-expense)" : "var(--color-income)";
        const name = debt.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent");
        const share = clearedShare(debt);
        const last = lastPaid(debt);

        return (
          <li key={debt.id} className={styles.loanCard} style={{ borderLeftColor: tone }} aria-label={name}>
            <button type="button" className={styles.cardOpen} onClick={() => onOpen(debt)} aria-label={t("debts.colOpen", { name })}>
              <span className={styles.cardName}>
                {name}
                <FiChevronRight size={15} aria-hidden />
              </span>
              <span className={styles.cardMeta}>
                {t(borrowed ? "debts.took" : "debts.gave")} {formatCurrency(debt.amount)}
              </span>
              <span className={styles.cardMeta}>{dayFmt.format(firestoreToDate(debt.date))}</span>
              {last && <span className={styles.cardMeta}>{t("debts.cardLast", { when: last })}</span>}
            </button>

            <div className={styles.cardRight}>
              {debt.isSettled ? <span className={styles.settledTag}>{t(debt.forgiven ? "debts.forgivenTag" : "debts.settled")}</span> : <span className={styles.cardAmount}>{formatCurrency(debt.remaining)}</span>}
              <span className={styles.cardBar}>
                <span aria-hidden>
                  <span style={{ width: `${share}%`, background: tone }} />
                </span>
                {Math.floor(share)}%
              </span>
              {!debt.isSettled && (
                <Button color="secondary" outline size="sm" className={styles.cardPay} onClick={() => onRecord(debt)}>
                  <FiPlus size={14} aria-hidden /> {t(borrowed ? "debts.payShortOut" : "debts.payShortIn")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
