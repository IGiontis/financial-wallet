import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MonthBars } from "../../../shared/components/MonthBars";
import { monthExtremes } from "../../../shared/utils/monthExtremes";
import { standaloneMonthName } from "../../../shared/utils/dates";
import { incomeMonthItems, type Income, type IncomeMonthAhead } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { IncomeMonthSheet } from "./IncomeMonthSheet";
import styles from "../css/IncomesPage.module.css";

/**
 * «Οι επόμενοι 12 μήνες»: what each month brings, as the «Πάγια» page shows
 * what each month asks — the same bars. The months with the most are green,
 * the ones with the least amber, and both are named under the chart, every
 * tied month with them; on a flat year (a salary and nothing else) there is no
 * such month and nothing is said. See `monthExtremes`.
 *
 * A bar opens its month: every income expected in it, as «Πάγια» opens its bills.
 */
export function IncomeMonthsAhead({
  months,
  incomes,
  transactions,
  formatCurrency,
  f,
  locale,
}: {
  months: IncomeMonthAhead[];
  incomes: Income[];
  transactions: Transaction[];
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  locale: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const openMonth = open !== null ? months[open] : undefined;
  const total = Math.round(months.reduce((sum, m) => sum + m.total, 0) * 100) / 100;
  const approx = months.some((m) => m.approximate) ? "≈" : "";
  const { highs, lows } = monthExtremes(months);
  const name = (date: Date) => standaloneMonthName(locale, date);
  // «Ιούλιος και Αύγουστος» — named as a list, in the nominative the sentence is built around.
  const names = (list: IncomeMonthAhead[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(list.map((m) => name(m.start)));

  return (
    <section className={`${styles.card} p-3 p-lg-4 mb-3`} aria-labelledby="incomes-ahead-title">
      <div className="stat-head d-flex justify-content-between align-items-baseline gap-2">
        <span id="incomes-ahead-title">{t("incomes.ahead.title")}</span>
        <span className="text-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
          {approx}
          {formatCurrency(total)}
        </span>
      </div>

      {total <= 0 ? (
        <p className="mb-0 text-body-secondary" style={{ fontSize: 13 }}>
          {t("incomes.year.empty")}
        </p>
      ) : (
        <>
          <MonthBars
            months={months.map((m) => ({ ...m, title: `${name(m.start)} — ${m.approximate ? "≈" : ""}${formatCurrency(m.total)}` }))}
            formatCurrency={formatCurrency}
            locale={locale}
            label={t("incomes.ahead.title")}
            highs={highs}
            lows={lows}
            highTone="income"
            lowTone="goal"
            onOpen={setOpen}
          />
          {(highs.length > 0 || lows.length > 0) && (
            <p className="mb-0 mt-3 pt-2 border-top small text-body-secondary">
              {highs.length > 0 && t("incomes.ahead.most", { months: names(highs), amount: formatCurrency(highs[0].total) })}
              {highs.length > 0 && lows.length > 0 && " "}
              {lows.length > 0 && t("incomes.ahead.least", { months: names(lows), amount: formatCurrency(lows[0].total) })}
            </p>
          )}
        </>
      )}

      {openMonth && (
        <IncomeMonthSheet month={openMonth.start} items={incomeMonthItems(incomes, transactions, openMonth.start)} formatCurrency={formatCurrency} f={f} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

export default IncomeMonthsAhead;
