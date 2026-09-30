import { Link } from "react-router-dom";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { STALE_AFTER_DAYS, type CheckInReading } from "../../accounts/accountsUtils";
import styles from "../pages/css/OverviewPage.module.css";

/**
 * How fresh the banks reading behind the figure is, what it found, and the
 * button to take a new one — on the Overview, where the figure is.
 *
 * Reading the banks is the habit that keeps every figure in the app honest,
 * and it lived two taps away, announced by a line of small link text. What the
 * readings found went without a record was shown only under "went out", on the
 * tabs that are not the first, as a red "+ 85 €" that read like income.
 */
export default function BankStrip({
  hasAccounts,
  latest,
  age,
  formatCurrency,
  onUpdate,
}: {
  hasAccounts: boolean;
  latest?: CheckInReading;
  /** Whole days since the latest reading. */
  age?: number;
  formatCurrency: (n: number) => string;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();

  if (!hasAccounts || !latest || age === undefined) {
    return (
      <div className={`${styles.strip} ${styles.stripNeutral}`}>
        <span className={styles.stripText}>{t("overview.stripNone")}</span>
        <Link to="/accounts" className="btn btn-sm btn-outline-primary flex-shrink-0">
          {t("overview.stripStart")}
        </Link>
      </div>
    );
  }

  const stale = age >= STALE_AFTER_DAYS;
  // The first reading has nothing before it to compare with, so it finds nothing.
  const unlogged = latest.unlogged ?? 0;
  const found =
    Math.abs(unlogged) >= 0.01 ? (
      <Link to="/accounts" className={styles.stripLink}>
        {t(unlogged < 0 ? "overview.stripFoundOut" : "overview.stripFoundIn", { amount: formatCurrency(Math.abs(unlogged)) })}
      </Link>
    ) : latest.expected !== undefined ? (
      <span>{t("overview.stripAllLogged")}</span>
    ) : null;

  return (
    <div className={`${styles.strip} ${stale ? styles.stripStale : styles.stripFresh}`}>
      <span className={styles.stripText}>
        <span className="fw-semibold">{age === 0 ? t("overview.stripToday") : t("overview.stripAgo", { count: age })}</span>
        {found && <span aria-hidden> · </span>}
        {found}
      </span>
      {stale ? (
        <Button size="sm" color="warning" className="flex-shrink-0" onClick={onUpdate}>
          {t("overview.stripUpdate")}
        </Button>
      ) : (
        <Button size="sm" color="link" className="flex-shrink-0 p-0 text-decoration-none" onClick={onUpdate}>
          {t("overview.stripAgain")}
        </Button>
      )}
    </div>
  );
}
