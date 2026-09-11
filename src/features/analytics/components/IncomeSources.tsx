import { useTranslation } from "react-i18next";
import type { Payee } from "../../transactions/transactionInsights";
import styles from "./css/Analytics.module.css";

/**
 * Where the money comes from, largest first.
 *
 * Deliberately a list and not the ring the insights panel used to draw for
 * income. A ring is for showing a whole divided into comparable parts; most
 * people's income is one part and a rounding error, which draws as a circle of
 * a single colour. What is actually worth knowing is how much of the total
 * rests on the biggest source — so the share sits against each row, and a
 * household living on one income can see that at a glance instead of inferring
 * it from a shape.
 */
export default function IncomeSources({ rows, total, formatCurrency }: { rows: Payee[]; total: number; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const top = rows[0]?.amount ?? 0;

  return (
    <div className="d-flex flex-column gap-2">
      {rows.map((row) => {
        const share = total > 0 ? Math.round((row.amount / total) * 100) : 0;
        return (
          <div key={row.name}>
            <div className="d-flex justify-content-between gap-2 mb-1" style={{ fontSize: 12 }}>
              <span className={styles.sourceName}>{row.name}</span>
              <span className="flex-shrink-0">
                <span className="fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(row.amount)}
                </span>
                <span className="text-body-secondary"> · {t("analytics.income.shareOfAll", { percent: share })}</span>
              </span>
            </div>
            {/* Against the biggest source rather than the total, so the smaller
                ones are still visible when one source is almost everything. */}
            <div className={styles.sourceTrack}>
              <div className={styles.sourceFill} style={{ width: top > 0 ? `${(row.amount / top) * 100}%` : "0%" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
