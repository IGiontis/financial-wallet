import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { FiAlertCircle, FiCheck, FiClock } from "react-icons/fi";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { billCoverage, billCoverageYears, supportsMonthStrip, type MonthCell, type MonthCellStatus } from "./billsUtils";
import styles from "./css/BillsPage.module.css";

interface BillYearGridProps {
  bill: BillWithStatus;
  now: Date;
  formatCurrency: (n: number) => string;
  /** A month that owes something — hand back the period it settles. */
  onPay: (cell: MonthCell) => void;
  /** A month already settled — hand back the payment behind it. */
  onOpenPayment: (cell: MonthCell) => void;
}

/** Only the month a stretch begins in carries a mark; the rest are its tail. */
const STATUS_ICON: Partial<Record<MonthCellStatus, IconType>> = {
  paid: FiCheck,
  overdue: FiAlertCircle,
  due: FiClock,
};

/**
 * Every month the bill covers, laid out a year to a row.
 *
 * Colour is coverage, not due dates: a yearly subscription paid in October runs
 * green through the following September and turns over in October, which is
 * what having paid it actually feels like. Any square is a place to pay, so a
 * payment made two years ago is filed by pressing the month it was made in —
 * the thing the old four-option dropdown made impossible.
 */
export function BillYearGrid({ bill, now, formatCurrency, onPay, onOpenPayment }: BillYearGridProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const years = useMemo(() => billCoverageYears(bill, now), [bill, now]);
  const cells = useMemo(() => billCoverage(bill, years, now), [bill, years, now]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);

  if (!supportsMonthStrip(bill)) return null;

  const renderCell = (cell: MonthCell) => {
    const name = monthFmt.format(new Date(cell.year, cell.month, 1));

    if (cell.status === "none") {
      return (
        <div key={cell.month} className={`${styles.monthCell} ${styles.monthCellEmpty}`} aria-hidden>
          {name}
        </div>
      );
    }

    const Icon = cell.isPeriodStart ? STATUS_ICON[cell.status] : undefined;
    const settled = cell.status === "paid";
    const when = settled && cell.payment ? dateFmt.format(cell.payment.paidDate) : cell.dueDate ? dateFmt.format(cell.dueDate) : "";

    return (
      <button
        key={cell.month}
        type="button"
        className={`${styles.monthCell} ${styles[`monthCell_${cell.status}`]} ${cell.isPeriodStart ? styles.monthCellStart : ""}`}
        onClick={() => (settled ? onOpenPayment(cell) : onPay(cell))}
        title={`${name} ${cell.year} · ${when} · ${formatCurrency(cell.amount ?? 0)}`}
        aria-label={`${name} ${cell.year} — ${t(`bills.monthState_${cell.status}`)} — ${formatCurrency(cell.amount ?? 0)}`}
      >
        <span className={styles.monthCellName}>{name}</span>
        <span className={styles.monthCellMark}>{Icon ? <Icon size={12} aria-hidden /> : null}</span>
      </button>
    );
  };

  return (
    <div className="mb-3">
      <div className="text-uppercase text-body-secondary mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
        {t("bills.payByMonth")}
      </div>

      {years.map((year) => (
        <div key={year} className={styles.yearRow}>
          <div className={styles.yearLabel}>{year}</div>
          <div className={styles.yearGrid}>{cells.filter((cell) => cell.year === year).map(renderCell)}</div>
        </div>
      ))}

      <div className={styles.yearLegend}>
        <span>
          <FiCheck size={11} style={{ color: "var(--color-income)" }} aria-hidden /> {t("bills.monthState_paid")}
        </span>
        <span>
          <FiAlertCircle size={11} style={{ color: "var(--color-expense)" }} aria-hidden /> {t("bills.monthState_overdue")}
        </span>
        <span>
          <FiClock size={11} style={{ color: "var(--color-goal)" }} aria-hidden /> {t("bills.monthState_due")}
        </span>
        <span>{t("bills.coverageHint")}</span>
      </div>
    </div>
  );
}
