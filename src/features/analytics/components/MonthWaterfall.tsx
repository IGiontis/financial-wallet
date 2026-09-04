import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import styles from "./css/Waterfall.module.css";
import type { WaterfallStep } from "../analyticsUtils";

/**
 * Income, then each big category taken off it, then what survived.
 *
 * Drawn as rows rather than columns, and as plain elements rather than a chart:
 * category names on a shared horizontal axis collide the moment there are more
 * than four or five of them, and the wider the card the worse it gets, because
 * the labels grow with the text while the slots grow with the container. Given
 * a column of its own, a name has room whatever it is called and however many
 * there are.
 *
 * Every step is measured against the same scale, so the bar offsets show the
 * running total falling — the thing a waterfall exists to show — while the
 * figures stay readable as a list.
 */
export default function MonthWaterfall({ steps, nameFor, formatCurrency }: { steps: WaterfallStep[]; nameFor: (id: string) => string; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    // Scaled to the largest figure on show, so income sets the full width and
    // everything else is read against it.
    const peak = Math.max(...steps.map((s) => Math.max(Math.abs(s.amount), Math.abs(s.balance))), 1);
    const pct = (n: number) => `${Math.max((Math.abs(n) / peak) * 100, 0.8)}%`;

    return steps.map((step) => ({
      ...step,
      name: nameFor(step.id),
      width: pct(step.amount),
      // A cost hangs from where the running total was down to where it lands;
      // income and the remainder start at the floor.
      offset: step.kind === "expense" ? pct(step.balance) : "0%",
    }));
  }, [steps, nameFor]);

  return (
    <div className={styles.rows}>
      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <span className={styles.name} title={row.name}>
            {row.name}
          </span>
          <span className={styles.track}>
            <span
              className={`${styles.bar} ${row.kind === "income" ? styles.barIncome : row.kind === "result" ? styles.barResult : styles.barExpense}`}
              style={{ left: row.offset, width: row.width }}
            />
          </span>
          <span className={`${styles.amount} ${row.kind === "income" ? styles.amountIncome : row.kind === "result" ? styles.amountResult : ""}`}>
            {row.kind === "expense" ? "−" : row.amount < 0 ? "−" : "+"}
            {formatCurrency(Math.abs(row.amount))}
          </span>
          {row.kind === "expense" && (
            <span className={styles.left}>{t("analytics.waterfall.leftShort", { amount: formatCurrency(row.balance) })}</span>
          )}
        </div>
      ))}
    </div>
  );
}
