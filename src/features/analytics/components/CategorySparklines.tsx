import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import styles from "./css/Sparklines.module.css";
import type { CategorySeries } from "../analyticsUtils";

/**
 * One tiny chart per category, all on the same footprint.
 *
 * Small multiples in place of the radar it replaces: the eye compares a dozen
 * short lines far more reliably than the areas of one irregular polygon, and
 * nothing has to be clicked before it says anything. Each is scaled to its own
 * peak, because the question is which way a category is going, not whether it
 * is bigger than rent.
 */
export default function CategorySparklines({
  rows,
  nameFor,
  formatCurrency,
}: {
  rows: CategorySeries[];
  nameFor: (id: string) => string;
  formatCurrency: (n: number) => string;
}) {
  const { t } = useTranslation();

  const paths = useMemo(
    () =>
      rows.map((row) => {
        const peak = Math.max(...row.points, 1);
        const step = row.points.length > 1 ? 60 / (row.points.length - 1) : 0;
        const points = row.points.map((value, i) => `${(i * step).toFixed(1)},${(20 - (value / peak) * 18).toFixed(1)}`).join(" ");
        return { ...row, points, last: row.points[row.points.length - 1] ?? 0 };
      }),
    [rows],
  );

  return (
    <div className={styles.grid}>
      {paths.map((row) => {
        // A tenth either way is noise on a monthly figure; only call a category
        // rising or falling when it has actually moved.
        const tone = row.trend > 0.1 ? "var(--color-expense)" : row.trend < -0.1 ? "var(--color-income)" : "var(--color-text-secondary)";

        return (
          <div key={row.categoryId} className={styles.cell}>
            <div className={styles.name} title={nameFor(row.categoryId)}>
              {nameFor(row.categoryId)}
            </div>
            <svg className={styles.spark} viewBox="0 0 60 20" preserveAspectRatio="none" role="img" aria-label={nameFor(row.categoryId)}>
              <polyline points={row.points} fill="none" stroke={tone} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className={styles.figure}>
              <span>{formatCurrency(row.total)}</span>
              {Math.abs(row.trend) > 0.1 && (
                <span style={{ color: tone }}>
                  {row.trend > 0 ? "+" : "−"}
                  {Math.round(Math.abs(row.trend) * 100)}%
                </span>
              )}
            </div>
            <span className="visually-hidden">{t("analytics.sparklines.lastMonth", { amount: formatCurrency(row.last) })}</span>
          </div>
        );
      })}
    </div>
  );
}
