import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiChevronRight } from "react-icons/fi";
import { STALE_AFTER_DAYS, type CheckInReading } from "../../accounts/accountsUtils";
import styles from "../pages/css/OverviewPage.module.css";

/**
 * How fresh the banks reading behind the figure is, and what it found — on the
 * Overview, where the figure is.
 *
 * Reading the banks is the habit that keeps every figure in the app honest, so
 * its age and its finding sit right under the money it corrects. Taking a new
 * reading happens on the Banks & cash page: the Overview is for looking at what
 * has been entered, so the whole strip is the way there rather than a button.
 */
export default function BankStrip({
  hasAccounts,
  latest,
  age,
  formatCurrency,
}: {
  hasAccounts: boolean;
  latest?: CheckInReading;
  /** Whole days since the latest reading. */
  age?: number;
  formatCurrency: (n: number) => string;
}) {
  const { t } = useTranslation();

  if (!hasAccounts || !latest || age === undefined) {
    return (
      <Link to="/accounts" className={`${styles.strip} ${styles.stripNeutral} text-decoration-none`}>
        <span className={styles.stripText}>{t("overview.stripNone")}</span>
        <FiChevronRight size={16} className="flex-shrink-0" aria-hidden />
      </Link>
    );
  }

  const stale = age >= STALE_AFTER_DAYS;
  // The first reading has nothing before it to compare with, so it finds nothing.
  const unlogged = latest.unlogged ?? 0;
  const found =
    Math.abs(unlogged) >= 0.01
      ? t(unlogged < 0 ? "overview.stripFoundOut" : "overview.stripFoundIn", { amount: formatCurrency(Math.abs(unlogged)) })
      : latest.expected !== undefined
        ? t("overview.stripAllLogged")
        : undefined;

  return (
    <Link to="/accounts" className={`${styles.strip} ${stale ? styles.stripStale : styles.stripFresh} text-decoration-none`}>
      <span className={styles.stripText}>
        <span className="fw-semibold">{age === 0 ? t("overview.stripToday") : t("overview.stripAgo", { count: age })}</span>
        {found && (
          <>
            <span aria-hidden> · </span>
            {found}
          </>
        )}
      </span>
      <FiChevronRight size={16} className="flex-shrink-0" aria-hidden />
    </Link>
  );
}
