import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useWorkspaceSetting } from "../../../shared/hooks/useWorkspaceSetting";
import { useIncomeList } from "../../incomes/useIncomes";
import { useBills } from "../../bills/useBills";
import { PLANNER_KEYS, cleanOverrides } from "../../plannerPage/plannerInputs";
import type { OccurrenceOverride } from "../../plannerPage/plannerActuals";
import { incomesBillsYears, incomesVsBills, type IncomesBillsMonth } from "../incomesVsBills";
import { ChartCard } from "./ChartCard";
import { ChartDetails, DetailsTable, type DetailsColumn } from "./DetailsTable";
import { signedWith } from "./chartTheme";
import IncomesBillsChart, { type IncomesBillsPoint } from "./IncomesBillsChart";
import styles from "./css/Analytics.module.css";

/**
 * «Έσοδα και πάγια»: a year of the Incomes page against the Bills page, month
 * by month, with what each month leaves.
 *
 * Costs no read: the incomes and the words said about them live on the user
 * document, and the bills are the query the menu's badge keeps loaded on every
 * screen. The figures are the two pages' own (`incomesVsBills`).
 */
export function IncomesBillsCard({ transactions, now, formatCurrency }: { transactions: Transaction[]; now: Date; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { incomes } = useIncomeList();
  const { data: bills = [] } = useBills();
  const [storedOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  const overrides = useMemo(() => cleanOverrides(storedOverrides), [storedOverrides]);

  const years = useMemo(() => incomesBillsYears(incomes, now), [incomes, now]);
  const [year, setYear] = useState(now.getFullYear());
  const at = years.indexOf(year);

  const result = useMemo(() => incomesVsBills(year, { incomes, overrides, transactions, bills, now }), [year, incomes, overrides, transactions, bills, now]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const points: IncomesBillsPoint[] = useMemo(() => result.months.map((m) => ({ ...m, label: monthFmt.format(m.start).replace(".", "") })), [result, monthFmt]);

  const signed = signedWith(formatCurrency);
  const nothing = result.income === 0 && result.bills === 0;
  const hasScheduled = result.months.some((m) => m.source === "scheduled");
  const hasActual = result.months.some((m) => m.source === "actual");

  const toolbar = (
    <div className={styles.stepper} role="group" aria-label={t("analytics.incomesBills.year")}>
      <button type="button" className={styles.stepBtn} onClick={() => setYear(years[at - 1])} disabled={at <= 0} aria-label={t("common.prev")}>
        <FiChevronLeft aria-hidden />
      </button>
      <span className={styles.stepLabel}>{year}</span>
      <button type="button" className={styles.stepBtn} onClick={() => setYear(years[at + 1])} disabled={at < 0 || at >= years.length - 1} aria-label={t("common.next")}>
        <FiChevronRight aria-hidden />
      </button>
    </div>
  );

  // Which bars are the record and which the plan, said in the key as well as drawn.
  const legend = (
    <div className={styles.legend}>
      <span className={styles.legendItem}>
        <span className={styles.swatch} style={{ background: "var(--chart-income)" }} aria-hidden />
        {t("analytics.incomesBills.income")}
      </span>
      <span className={styles.legendItem}>
        <span className={styles.swatch} style={{ background: "var(--chart-expense)" }} aria-hidden />
        {t("analytics.incomesBills.bills")}
      </span>
      <span className={styles.legendItem}>
        <span className={styles.swatchLine} style={{ background: "var(--chart-net)" }} aria-hidden />
        {t("analytics.incomesBills.difference")}
      </span>
      {hasActual && (
        <span className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: "var(--color-text-secondary)" }} aria-hidden />
          {t("analytics.incomesBills.actualKey")}
        </span>
      )}
      {hasScheduled && (
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchHatch}`} aria-hidden />
          {t("analytics.incomesBills.scheduledKey")}
        </span>
      )}
    </div>
  );

  const columns: DetailsColumn<IncomesBillsMonth & { label: string }>[] = [
    {
      key: "month",
      label: t("analytics.details.month"),
      cell: (r) => (
        <>
          {r.label} {r.source === "scheduled" && <span className={styles.plannedTag}>{t("analytics.incomesBills.scheduledShort")}</span>}
        </>
      ),
    },
    { key: "income", label: t("analytics.incomesBills.income"), numeric: true, cell: (r) => formatCurrency(r.income), foot: formatCurrency(result.income) },
    { key: "bills", label: t("analytics.incomesBills.bills"), numeric: true, cell: (r) => formatCurrency(r.bills), foot: formatCurrency(result.bills) },
    { key: "difference", label: t("analytics.incomesBills.difference"), numeric: true, tone: (r) => r.difference, cell: (r) => signed(r.difference), foot: signed(result.difference) },
  ];

  return (
    <ChartCard
      wide
      tall
      title={t("analytics.incomesBills.title")}
      hint={t("analytics.incomesBills.hint")}
      value={nothing ? undefined : signed(result.difference)}
      valueTone={result.difference > 0 ? "income" : result.difference < 0 ? "expense" : "neutral"}
      toolbar={toolbar}
      empty={nothing ? t("analytics.incomesBills.empty") : undefined}
      footer={legend}
      details={{
        hint: t("analytics.incomesBills.sourceNote"),
        content: (
          <ChartDetails
            note={t("analytics.incomesBills.sourceNote")}
            chart={<IncomesBillsChart data={points} formatCurrency={formatCurrency} />}
            legend={legend}
            tableTitle={t("analytics.details.table")}
            table={<DetailsTable rows={points} rowKey={(r) => r.key} columns={columns} footLabel={String(year)} />}
          />
        ),
      }}
    >
      <IncomesBillsChart data={points} formatCurrency={formatCurrency} compact />
    </ChartCard>
  );
}
