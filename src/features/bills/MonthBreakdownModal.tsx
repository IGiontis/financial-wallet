import type { ReactNode } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Badge } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiLock } from "react-icons/fi";
import type { Category } from "../../shared/types/IndexTypes";
import { isHardDeadline, type MonthForecast, type MonthForecastItem } from "./billsUtils";
import styles from "./css/BillsPage.module.css";

type ItemKind = "fixed" | "variable" | "paid" | "arrears";

interface MonthBreakdownModalProps {
  title: string;
  forecast: MonthForecast;
  /** Unpaid periods whose deadline has already passed — debt, not forecast. */
  arrears: MonthForecastItem[];
  categoryFor: (id: string) => Category | undefined;
  formatCurrency: (n: number) => string;
  /** Wording for an empty month — "nothing left to pay" reads differently
      from "nothing due next month". */
  emptyText: string;
  onClose: () => void;
}


interface SectionProps {
  heading: string;
  items: MonthForecastItem[];
  kind: ItemKind;
  accent?: string;
  renderItem: (item: MonthForecastItem, kind: ItemKind) => ReactNode;
  formatCurrency: (n: number) => string;
  countLabel: (count: number) => string;
}

/** A titled group with its own subtotal — nothing renders when it's empty. */
function Section({ heading, items, kind, accent, renderItem, formatCurrency, countLabel }: SectionProps) {
  if (items.length === 0) return null;
  const subtotal = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="mb-2">
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle} style={accent ? { color: accent } : undefined}>
          {heading}
          <span className={styles.sectionCount}>{countLabel(items.length)}</span>
        </span>
        <span className={styles.sectionTotal} style={accent ? { color: accent } : undefined}>
          {kind === "variable" ? "≈ " : ""}
          {formatCurrency(subtotal)}
        </span>
      </div>
      <div className="d-flex flex-column" style={{ gap: 3 }}>
        {items.map((i) => renderItem(i, kind))}
      </div>
    </div>
  );
}

/**
 * The line-by-line answer behind a month's headline figure — this month's or
 * next month's; the caller supplies which.
 *
 * Grouped rather than one flat run of dates, because the four groups are
 * answers to four different questions: what is certain, what is a guess, what
 * is already dealt with, and what you are behind on. A single chronological
 * list forces you to work that out for yourself from the styling of each row.
 *
 * Arrears sit at the top and outside the total on purpose — money owed for a
 * month that has already gone is not part of "what next month costs", and
 * folding it in would quietly inflate a figure meant for planning.
 */
export default function MonthBreakdownModal({ title, forecast, arrears, categoryFor, formatCurrency, emptyText, onClose }: MonthBreakdownModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const monthLabel = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(forecast.monthStart);
  const dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
  const arrearsFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });

  const fixed = forecast.items.filter((i) => !i.isPaid && !i.isVariable);
  const variable = forecast.items.filter((i) => !i.isPaid && i.isVariable);
  const paid = forecast.items.filter((i) => i.isPaid);
  const arrearsTotal = arrears.reduce((s, i) => s + i.amount, 0);

  const renderItem = (item: MonthForecastItem, kind: ItemKind) => {
    const category = categoryFor(item.bill.categoryId);
    const strict = isHardDeadline(item.bill);
    const fmt = kind === "arrears" ? arrearsFmt : dayFmt;

    // A settled row is dated by the payment, not by the due date it discharged:
    // rent for this month can perfectly well have been paid last month, and the
    // useful fact is when the money went.
    const note = kind === "paid" ? t("bills.breakdownSettled") : kind === "variable" ? t("bills.breakdownEstimated") : kind === "arrears" ? t("bills.breakdownUnpaid") : "";
    const shownDate = kind === "paid" && item.paidDate ? item.paidDate : item.date;

    return (
      <div key={`${item.bill.id}-${item.periodKey}`} className={`${styles.breakdownRow} ${kind === "paid" ? styles.breakdownRowPaid : ""}`}>
        <span className={`${styles.iconTile} ${styles.iconWrap}`} style={{ width: 26, height: 26, fontSize: 13 }}>
          <span aria-hidden>{category?.icon ?? "🧾"}</span>
          {kind === "paid" && (
            <span className={styles.paidTick} title={t("bills.paidRecently")}>
              <FiCheck size={9} aria-hidden />
            </span>
          )}
        </span>

        <div className={styles.breakdownMain}>
          <span className={`${styles.breakdownName} text-truncate`}>
            {item.bill.name}
            {strict && kind !== "paid" && <FiLock size={10} className={styles.strictMark} title={t("bills.strictHint")} />}
          </span>
          <span className={styles.breakdownSub}>
            {fmt.format(shownDate)}
            {note && ` · ${note}`}
          </span>
        </div>

        <span
          className={styles.breakdownAmount}
          style={kind === "paid" ? { color: "var(--color-income)" } : kind === "arrears" ? { color: "var(--color-expense)" } : undefined}
        >
          {kind === "variable" ? "≈ " : ""}
          {formatCurrency(item.amount)}
        </span>
      </div>
    );
  };

  // Spread rather than wrapped in a local component: a component declared here
  // would be a new type on every render and drop its children's state.
  const shared = { renderItem, formatCurrency, countLabel: (count: number) => t("bills.billCount", { count }) };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          {title}
          <Badge color="secondary" pill style={{ fontSize: 10 }}>
            {monthLabel}
          </Badge>
        </span>
      </ModalHeader>

      <ModalBody>
        {forecast.items.length === 0 && arrears.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 14 }}>
            {emptyText}
          </p>
        ) : (
          <>
            {/* Debt first: it is owed now, and no plan for next month is honest
                while a previous one is still outstanding. */}
            <Section {...shared} heading={t("bills.sectionArrears")} items={arrears} kind="arrears" accent="var(--color-expense)" />

            {arrears.length > 0 && <hr className="my-3" />}

            {forecast.items.length > 0 && (
              <div className={`${styles.forecastCard} p-3 mb-3`}>
                <div className={styles.forecastLine}>
                  <span className={styles.forecastLabel}>
                    {t("bills.fixedTotal")}
                    <span className={styles.forecastCount}>{t("bills.billCount", { count: forecast.fixedCount })}</span>
                  </span>
                  <span className={styles.forecastValue}>{formatCurrency(forecast.fixed)}</span>
                </div>
                <div className={styles.forecastLine}>
                  <span className={styles.forecastLabel}>
                    <span className={styles.forecastOp} aria-hidden>
                      +
                    </span>
                    {t("bills.variableTotal")}
                    <span className={styles.forecastCount}>{t("bills.billCount", { count: forecast.variableCount })}</span>
                  </span>
                  <span className={styles.forecastValue}>{formatCurrency(forecast.variable)}</span>
                </div>
                <div className={`${styles.forecastLine} ${styles.forecastTotalLine}`}>
                  <span className={styles.forecastLabel}>{t("bills.approxTotal")}</span>
                  <span className={styles.forecastTotal}>≈ {formatCurrency(forecast.total)}</span>
                </div>
                {arrearsTotal > 0 && <div className={styles.forecastWarn}>⚠ {t("bills.arrearsNote", { amount: formatCurrency(arrearsTotal), count: arrears.length })}</div>}
                {forecast.prepaid > 0 && <div className={styles.forecastNote}>⏩ {t("bills.prepaidNote", { amount: formatCurrency(forecast.prepaid), count: forecast.prepaidCount })}</div>}
              </div>
            )}

            <Section {...shared} heading={t("bills.fixedTotal")} items={fixed} kind="fixed" />
            <Section {...shared} heading={t("bills.variableTotal")} items={variable} kind="variable" />
            <Section {...shared} heading={t("bills.sectionPaid")} items={paid} kind="paid" accent="var(--color-income)" />

            {variable.length > 0 && (
              <p className="text-body-secondary mb-0" style={{ fontSize: 11.5 }}>
                {t("bills.forecastHint")}
              </p>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
