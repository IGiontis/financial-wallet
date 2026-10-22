import { useTranslation } from "react-i18next";
import styles from "../pages/css/OverviewPage.module.css";

type Money = (n: number) => string;

export interface AccountFigure {
  id: string;
  name: string;
  amount: number;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Where the money there is now sits, under the figure: each bank and the cash,
 * less what is held for goals — lines that add up to the figure above, to the
 * cent. Then the month so far, in and out.
 *
 * Shown only when the lines do add up. The figure is worked out from the
 * records and the banks from their last reading; they agree whenever the two
 * are in step, and when they are not, a list that came to a different sum than
 * the figure over it would be worse than no list.
 */
export function MoneyBreakdown({
  accounts,
  inGoals,
  figure,
  month,
  formatCurrency,
}: {
  accounts: AccountFigure[];
  inGoals: number;
  /** The figure above, which the lines must reach. */
  figure: number;
  month?: { label: string; income: number; expenses: number };
  formatCurrency: Money;
}) {
  const { t } = useTranslation();
  const sum = accounts.reduce((total, account) => total + cents(account.amount), 0) - cents(inGoals);
  const addsUp = accounts.length > 0 && sum === cents(figure);

  if (!addsUp && !month) return null;
  return (
    <div className={styles.breakdown}>
      {addsUp && (
        <dl className={styles.breakdownList} aria-label={t("overview.heroWhere")}>
          {accounts.map((account) => (
            <div key={account.id} className={styles.breakdownRow}>
              <dt>{account.name}</dt>
              <dd>{formatCurrency(account.amount)}</dd>
            </div>
          ))}
          {inGoals > 0 && (
            <div className={`${styles.breakdownRow} ${styles.breakdownQuiet}`}>
              <dt>{t("overview.heroLessGoals")}</dt>
              <dd>−{formatCurrency(inGoals)}</dd>
            </div>
          )}
        </dl>
      )}
      {month && (
        <div className={`${styles.breakdownRow} ${styles.breakdownMonth}`}>
          <span>{month.label}</span>
          <span>
            <span className="visually-hidden">{t("overview.heroMonthIn")} </span>+{formatCurrency(month.income)}
            <span aria-hidden> / </span>
            <span className="visually-hidden">, {t("overview.heroMonthOut")} </span>−{formatCurrency(month.expenses)}
          </span>
        </div>
      )}
    </div>
  );
}

export default MoneyBreakdown;
