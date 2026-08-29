import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Badge } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiLock } from "react-icons/fi";
import type { Category } from "../../shared/types/IndexTypes";
import { isHardDeadline, type MonthForecast, type MonthForecastItem } from "./billsUtils";
import styles from "./css/BillsPage.module.css";

interface NextMonthModalProps {
  forecast: MonthForecast;
  /** Unpaid periods whose deadline has already passed — debt, not forecast. */
  arrears: MonthForecastItem[];
  categoryFor: (id: string) => Category | undefined;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

/**
 * The line-by-line answer behind next month's headline figure.
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
export default function NextMonthModal({ forecast, arrears, categoryFor, formatCurrency, onClose }: NextMonthModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const monthLabel = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(forecast.monthStart);
  const dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
  const arrearsFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });

  const fixed = forecast.items.filter((i) => !i.isPaid && !i.isVariable);
  const variable = forecast.items.filter((i) => !i.isPaid && i.isVariable);
  const paid = forecast.items.filter((i) => i.isPaid);
  const arrearsTotal = arrears.reduce((s, i) => s + i.amount, 0);

  const renderItem = (item: MonthForecastItem, kind: "fixed" | "variable" | "paid" | "arrears") => {
    const category = categoryFor(item.bill.categoryId);
    const strict = isHardDeadline(item.bill);
    const fmt = kind === "arrears" ? arrearsFmt : dayFmt;

    const note = kind === "paid" ? t("bills.breakdownSettled") : kind === "variable" ? t("bills.breakdownEstimated") : kind === "arrears" ? t("bills.breakdownUnpaid") : "";

    return (
      <div key={`${item.bill.id}-${item.periodKey}`} className={`${styles.breakdownRow} ${kind === "paid" ? styles.breakdownRowPaid : ""}`}>
        <span className={`${styles.iconTile} ${styles.iconWrap}`} style={{ width: 34, height: 34, fontSize: 16 }}>
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
            {fmt.format(item.date)}
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

  /** A titled group with its own subtotal — nothing renders when it's empty. */
  const Section = ({ title, items, kind, accent }: { title: string; items: MonthForecastItem[]; kind: "fixed" | "variable" | "paid" | "arrears"; accent?: string }) => {
    if (items.length === 0) return null;
    const subtotal = items.reduce((s, i) => s + i.amount, 0);

    return (
      <div className="mb-3">
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle} style={accent ? { color: accent } : undefined}>
            {title}
            <span className={styles.sectionCount}>{t("bills.billCount", { count: items.length })}</span>
          </span>
          <span className={styles.sectionTotal} style={accent ? { color: accent } : undefined}>
            {kind === "variable" ? "≈ " : ""}
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div className="d-flex flex-column gap-1">{items.map((i) => renderItem(i, kind))}</div>
      </div>
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          {t("bills.nextMonthTitle")}
          <Badge color="secondary" pill style={{ fontSize: 10 }}>
            {monthLabel}
          </Badge>
        </span>
      </ModalHeader>

      <ModalBody>
        {forecast.items.length === 0 && arrears.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 14 }}>
            {t("bills.nothingNextMonth")}
          </p>
        ) : (
          <>
            {/* Debt first: it is owed now, and no plan for next month is honest
                while a previous one is still outstanding. */}
            <Section title={t("bills.sectionArrears")} items={arrears} kind="arrears" accent="var(--color-expense)" />

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

            <Section title={t("bills.fixedTotal")} items={fixed} kind="fixed" />
            <Section title={t("bills.variableTotal")} items={variable} kind="variable" />
            <Section title={t("bills.sectionPaid")} items={paid} kind="paid" accent="var(--color-income)" />

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
