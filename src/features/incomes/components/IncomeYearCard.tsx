import { useTranslation } from "react-i18next";
import { KIND_ICON, type Income, type IncomeYear } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

/**
 * «Η χρονιά»: the twelve months from this one, as the Bills page has it beside
 * its list. Beside the list on a desktop, the third tab on a phone.
 *
 * The sum is written out under the figure — 1.450×12 + … + 320×10 — because
 * that is what explains why "a month across the year" comes out under this
 * month's total: the lessons take the summer off.
 */
export function IncomeYearCard({ year, formatCurrency, f, onOpen }: { year: IncomeYear; formatCurrency: (n: number) => string; f: IncomeFormats; onOpen: (income: Income) => void }) {
  const { t } = useTranslation();
  const rows = year.rows.filter((r) => r.count > 0);
  const approx = year.approximate ? "≈" : "";
  const top = rows[0]?.total ?? 0;

  return (
    <section className={`${styles.yearCard} p-3 p-lg-4`} aria-labelledby="incomes-year-title">
      <div id="incomes-year-title" className="fw-semibold" style={{ fontSize: 14 }}>
        {t("incomes.year.title")}
      </div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{t("incomes.year.range", { from: f.monthYearShort.format(year.from), to: f.monthYearShort.format(year.to) })}</div>

      {rows.length === 0 ? (
        <p className="mb-0 mt-3" style={{ fontSize: 13, opacity: 0.8 }}>
          {t("incomes.year.empty")}
        </p>
      ) : (
        <>
          <div className="d-flex align-items-baseline justify-content-between gap-2 mt-3">
            <span style={{ fontSize: 12, opacity: 0.75 }}>{t("incomes.year.total")}</span>
            <span className={styles.yearAmount}>
              {approx}
              {formatCurrency(year.total)}
            </span>
          </div>
          <div className="d-flex align-items-baseline justify-content-between gap-2 mt-1">
            <span style={{ fontSize: 12, opacity: 0.75 }}>{t("incomes.year.perMonth")}</span>
            <span className="fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {approx}
              {formatCurrency(year.perMonth)}
            </span>
          </div>

          <hr className={styles.yearDivider} />

          <div className="d-flex flex-column gap-2">
            {rows.map((row) => (
              <button
                key={row.income.id}
                type="button"
                onClick={() => onOpen(row.income)}
                className="btn p-0 text-start border-0"
                style={{ color: "inherit" }}
                aria-label={`${row.income.name}: ${formatCurrency(row.total)}`}
              >
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1" style={{ fontSize: 12.5 }}>
                  <span className="text-truncate">
                    <span aria-hidden>{KIND_ICON[row.income.kind]}</span> {row.income.name}
                  </span>
                  <span className="flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {row.approximate ? "≈" : ""}
                    {formatCurrency(row.total)}
                  </span>
                </div>
                <div className={styles.yearTrack}>
                  <div className={styles.yearFill} style={{ width: `${top > 0 ? (row.total / top) * 100 : 0}%` }} />
                </div>
              </button>
            ))}
          </div>

          <hr className={styles.yearDivider} />

          <div className={styles.yearNote}>
            {rows.map((r) => `${formatCurrency(r.each)}×${r.count}`).join(" + ")} = {approx}
            {formatCurrency(year.total)}
          </div>
        </>
      )}
    </section>
  );
}
