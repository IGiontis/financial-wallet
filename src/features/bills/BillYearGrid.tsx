import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { FiAlertCircle, FiCheck, FiClock } from "react-icons/fi";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { billCoverage, billCoverageYears, supportsMonthStrip, type MonthCell, type MonthCellStatus } from "./billsUtils";
import { InfoLegend } from "../../shared/components/InfoLegend";
import { dayTone, type DayToneInput } from "../calendar/dayTone";
import { dayKey } from "../calendar/components/dayKey";
import styles from "./css/BillsPage.module.css";
import { dateFormat } from "../../shared/utils/dates";

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
  partial: FiCheck,
  overdue: FiAlertCircle,
  due: FiClock,
};

/**
 * A month in the calendars' shared colours (`dayTone`): red while it is to
 * pay, the amber dot when it is late, pale red and struck through once paid, a
 * dashed red edge for the months still to come, a dashed grey one for a month
 * off. An instalment square answers for itself — handed over or still owed —
 * not for the stretch it sits in.
 */
function monthLook(cell: MonthCell): DayToneInput {
  if (cell.installment) return { out: cell.installment.paid ? "done" : "todo" };
  switch (cell.status) {
    case "paid":
    case "partial":
      return { out: "done" };
    case "overdue":
      return { out: "todo", late: true };
    case "due":
      return { out: "todo" };
    case "future":
      return { out: "ahead" };
    case "paused":
      return { off: true };
    default:
      return {};
  }
}

/**
 * Every month the bill covers, laid out a year to a row.
 *
 * Colour is coverage, not due dates: a yearly subscription paid in October runs
 * paid through the following September and turns over in October, which is
 * what having paid it actually feels like. Any square is a place to pay, so a
 * payment made two years ago is filed by pressing the month it was made in —
 * the thing the old four-option dropdown made impossible.
 */
export function BillYearGrid({ bill, now, formatCurrency, onPay, onOpenPayment }: BillYearGridProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const years = useMemo(() => billCoverageYears(bill, now), [bill, now]);
  const cells = useMemo(() => billCoverage(bill, years, now), [bill, years, now]);

  const monthFmt = dateFormat("monthShort", lang);
  const dateFmt = dateFormat("day", lang);

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

    // With instalments the mark belongs on the months money changes hands in,
    // not on the one the period happens to start in.
    const marked = cell.installment ? true : cell.isPeriodStart;
    // An instalment month shows "2/3" instead of an icon, so it needs none.
    const Icon = marked && !cell.installment ? STATUS_ICON[cell.status] : undefined;
    const settled = cell.installment ? cell.installment.paid : cell.status === "paid";
    const when = cell.installment
      ? dateFmt.format(cell.installment.dueDate)
      : settled && cell.payment
        ? dateFmt.format(cell.payment.paidDate)
        : cell.dueDate
          ? dateFmt.format(cell.dueDate)
          : "";
    const money = cell.installment ? cell.installment.amount : (cell.amount ?? 0);

    return (
      <button
        key={cell.month}
        type="button"
        className={`${styles.monthCell} ${dayTone(monthLook(cell))} ${marked ? styles.monthCellStart : ""}`}
        onClick={() => (settled ? onOpenPayment(cell) : onPay(cell))}
        title={`${name} ${cell.year} · ${when} · ${formatCurrency(money)}`}
        aria-label={`${name} ${cell.year} — ${cell.installment ? t("bills.installmentOf", { index: cell.installment.index + 1, count: cell.installment.count }) + " — " : ""}${t(`bills.monthState_${cell.status}`)} — ${formatCurrency(money)}`}
      >
        <span className={styles.monthCellName}>{name}</span>
        {cell.installment ? (
          <span className={styles.monthCellPart}>
            {cell.installment.index + 1}/{cell.installment.count}
          </span>
        ) : (
          <span className={styles.monthCellMark}>{Icon ? <Icon size={12} aria-hidden /> : null}</span>
        )}
      </button>
    );
  };

  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <span className="text-uppercase text-body-secondary" style={{ fontSize: "var(--fs-caption)", fontWeight: 600, letterSpacing: "0.06em" }}>
          {t("bills.payByMonth")}
        </span>
        {/* The key behind the ⓘ, each line drawn with the squares' own classes. */}
        <InfoLegend
          title={t("calendar.keyTitle")}
          entries={[
            dayKey("due", { out: "todo" }, t("bills.monthState_due")),
            dayKey("overdue", { out: "todo", late: true }, t("bills.monthState_overdue")),
            dayKey("paid", { out: "done" }, t("bills.monthState_paid")),
            dayKey("future", { out: "ahead" }, t("bills.monthState_future")),
            dayKey("paused", { off: true }, t("bills.monthState_paused")),
          ]}
        >
          <p>{t("bills.coverageHint")}</p>
        </InfoLegend>
      </div>

      {years.map((year) => (
        <div key={year} className={styles.yearRow}>
          <div className={styles.yearLabel}>{year}</div>
          <div className={styles.yearGrid}>{cells.filter((cell) => cell.year === year).map(renderCell)}</div>
        </div>
      ))}

    </div>
  );
}
