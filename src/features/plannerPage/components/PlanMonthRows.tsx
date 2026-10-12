import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PlanPeriod } from "../plannerUtils";
import { monthRows } from "../monthRows";
import styles from "../css/PlannerPage.module.css";

/**
 * «Από πού βγαίνει το υπόλοιπο», one month to a row.
 *
 * It was a chart: bars for in and out on one scale, the balance as a line on a
 * second one, the two zeros matched by stretching an axis. The figures were
 * right and nobody could read them — the line sat above the bars on numbers
 * like 733 and −367, and started at the end of the first month rather than at
 * today. Here each month says it in words a person would use: where it starts
 * and ends, what came in and went out as two bars on one shared length, and
 * what it left.
 */
export function PlanMonthRows({ periods, opening, formatCurrency, locale }: { periods: PlanPeriod[]; opening: number; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
  const shortFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);

  const rows = useMemo(
    () =>
      monthRows(periods, opening, (period) =>
        period.key.includes("Q") ? `${shortFmt.format(period.start)} — ${monthFmt.format(new Date(period.start.getFullYear(), period.start.getMonth() + 2, 1))}` : monthFmt.format(period.start),
      ),
    [periods, opening, monthFmt, shortFmt],
  );
  // One length for every bar on the page, so a month's bars can be compared with another's.
  const longest = Math.max(1, ...rows.flatMap((row) => [row.income, row.outgoing]));
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

  return (
    <div className={styles.flowRows}>
      {rows.map((row) => {
        const left = Math.round((row.income - row.outgoing) * 100) / 100;
        return (
          <section key={row.key} className={styles.flowRow} aria-label={row.name}>
            <div className={styles.flowRowHead}>
              <span className={styles.flowRowName}>{row.name}</span>
              <span className={styles.flowRowSpan}>
                {formatCurrency(row.from)} → <strong style={{ color: row.to < 0 ? "var(--color-expense-text)" : undefined }}>{formatCurrency(row.to)}</strong>
              </span>
            </div>
            <div className={styles.flowRowBars}>
              <span>{t("planner.rowsIn")}</span>
              <span className={styles.flowRowTrack}>
                <span className={styles.flowRowIn} style={{ width: `${(row.income / longest) * 100}%` }} />
              </span>
              <span className={styles.flowRowIncome}>{signed(row.income)}</span>

              <span>{t("planner.rowsOut")}</span>
              <span className={styles.flowRowTrack}>
                <span className={styles.flowRowOut} style={{ width: `${(row.outgoing / longest) * 100}%` }} />
              </span>
              <span className={styles.flowRowExpense}>{signed(-row.outgoing)}</span>
            </div>
            <p className={styles.flowRowLeft}>
              {left >= 0 ? t(row.quarter ? "planner.rowsLeftQuarter" : "planner.rowsLeft") : t(row.quarter ? "planner.rowsShortQuarter" : "planner.rowsShort")}{" "}
              <span className={left >= 0 ? styles.flowRowIncome : styles.flowRowExpense}>{signed(left)}</span>
            </p>
          </section>
        );
      })}
    </div>
  );
}

export default PlanMonthRows;
