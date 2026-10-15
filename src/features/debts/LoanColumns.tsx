import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiPlus } from "react-icons/fi";
import { firestoreToDate } from "../../shared/utils/dates";
import { debtTimeline, loanState } from "./debtsUtils";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/DebtsPage.module.css";

/** How much of the debt is gone, for the bar under each column's head. */
function clearedShare(debt: DebtWithStatus): number {
  if (debt.amount <= 0) return 0;
  const loan = loanState(debt);
  const cleared = loan ? debt.amount - loan.balance : debt.paid;
  return Math.min(Math.max((cleared / debt.amount) * 100, 0), 100);
}

/**
 * Every loan with one person side by side, each a column read top to bottom.
 *
 * The question this answers is the one the one-at-a-time sheet makes awkward:
 * "what have I taken from Εθνική, and what did I pay on each, when". So each
 * column is its loan's whole story — what is left at the top, then every
 * payment newest first with its day, the time it was written down and what
 * was left after it, down to the day it began.
 *
 * Tapping a column's head opens that loan in the one-at-a-time view, where
 * payments are corrected; the columns themselves are for reading. On a phone
 * they scroll sideways, the next one peeking in so it is plain there is more.
 */
export function LoanColumns({
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
  const stampFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <div className={styles.columns} aria-label={t("debts.pickerLabel")}>
      {loans.map((debt) => {
        const borrowed = debt.direction === "owed_by_me";
        const tone = debt.isSettled ? "var(--color-text-secondary)" : borrowed ? "var(--color-expense)" : "var(--color-income)";
        const name = debt.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent");
        const rows = debtTimeline(debt);

        return (
          <section key={debt.id} className={styles.col} style={{ borderTopColor: tone }} aria-label={name}>
            <button type="button" className={styles.colHead} onClick={() => onOpen(debt)} aria-label={t("debts.colOpen", { name })}>
              <span className={styles.colName}>
                <span>{name}</span>
                <FiChevronRight size={15} aria-hidden />
              </span>
              {debt.isSettled ? (
                <span className={styles.settledTag}>{t("debts.settled")}</span>
              ) : (
                <>
                  <span className={styles.colLabel}>{t(borrowed ? "debts.leftToGive" : "debts.leftToGet")}</span>
                  <span className={styles.colAmount}>{formatCurrency(debt.remaining)}</span>
                </>
              )}
              <span className={styles.colLabel}>{t("debts.of", { amount: formatCurrency(debt.amount) })}</span>
              <span className={styles.colBar} aria-hidden>
                <span style={{ width: `${clearedShare(debt)}%`, background: tone }} />
              </span>
            </button>

            {!debt.isSettled && (
              <Button color="secondary" outline size="sm" className={styles.colRecord} onClick={() => onRecord(debt)}>
                <FiPlus size={14} aria-hidden /> {t(borrowed ? "debts.payShortOut" : "debts.payShortIn")}
              </Button>
            )}

            <ol className={styles.colList}>
              {rows.map(({ payment, split, balanceAfter }) => {
                const day = firestoreToDate(payment.date);
                const created = payment.createdAt ? firestoreToDate(payment.createdAt) : undefined;
                const known = created && !Number.isNaN(created.getTime());
                // The day of a payment is a day; the clock is when it was
                // written down — on that day, just the time; later, both.
                const sameDay = known && created.toDateString() === day.toDateString();
                return (
                  <li key={payment.id} className={styles.colRow}>
                    <span className={styles.colRowTop}>
                      <span>
                        {dayFmt.format(day)}
                        {sameDay && <span className={styles.colTime}> · {timeFmt.format(created)}</span>}
                      </span>
                      <strong>{formatCurrency(payment.amount)}</strong>
                    </span>
                    {split && <span className={styles.colSub}>{t("debts.splitRow", { principal: formatCurrency(split.principal), interest: formatCurrency(split.interest) })}</span>}
                    <span className={styles.colSub}>
                      {t("debts.colLeftAfter", { amount: formatCurrency(balanceAfter) })}
                      {known && !sameDay && ` · ${t("debts.colRecorded", { when: stampFmt.format(created) })}`}
                    </span>
                  </li>
                );
              })}
              {/* Where it began, at the foot: the column reads back in time. */}
              <li className={`${styles.colRow} ${styles.colOrigin}`}>
                <span className={styles.colRowTop}>
                  <span>
                    {t(borrowed ? "debts.took" : "debts.gave")} · {dayFmt.format(firestoreToDate(debt.date))}
                  </span>
                  <strong>{formatCurrency(debt.amount)}</strong>
                </span>
              </li>
            </ol>
            {rows.length === 0 && <p className={styles.colEmpty}>{t("debts.noPayments")}</p>}
          </section>
        );
      })}
    </div>
  );
}
