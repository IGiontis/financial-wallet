import { useTranslation } from "react-i18next";
import type { PaydayOutlook } from "../overviewTabs";
import styles from "./css/PaydayPath.module.css";

const VIEW_W = 300;
const VIEW_H = 80;

/**
 * The money day by day until pay day, as a line: where it is today, the day it
 * is lowest, and the pay landing at the end. Beside «Βγαίνεις ως τον μισθό» it
 * shows how — a slow drain, or a single bill that takes it to the floor.
 *
 * The line is drawn stretched to the card's width; the marks and their words
 * are laid over it in the page's own type, so they never stretch with it.
 * Under three days there is no shape to draw, and nothing is.
 */
export function PaydayPath({ path, formatCurrency, dayDate }: { path: PaydayOutlook["path"]; formatCurrency: (n: number) => string; dayDate: Intl.DateTimeFormat }) {
  const { t } = useTranslation();
  if (path.length < 3) return null;

  const balances = path.map((p) => p.balance);
  // From the lowest day to the highest, so a dip shows: held to zero, 8.600 € a
  // bill of 51 € took off drew a flat line. Zero comes into view only when the
  // money goes under it — and then its dashed line with it.
  const high = Math.max(...balances);
  const low0 = Math.min(...balances);
  const pad = (high - low0) * 0.15 || Math.max(Math.abs(high) * 0.05, 1);
  const top = high + pad;
  const bottom = low0 < 0 ? Math.min(low0, 0) - pad : low0 - pad;
  const span = top - bottom;
  const x = (i: number) => (i / (path.length - 1)) * VIEW_W;
  const y = (balance: number) => 6 + (1 - (balance - bottom) / span) * (VIEW_H - 12);
  const line = path.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `0,${VIEW_H} ${line} ${VIEW_W},${VIEW_H}`;

  // The lowest day before the pay lands — the figure the verdict is about.
  const beforePay = path.filter((p) => !p.pay);
  const low = beforePay.reduce((min, p, i) => (p.balance < beforePay[min].balance ? i : min), 0);
  const lowPoint = beforePay[low];
  const pay = path[path.length - 1].pay ? path.length - 1 : undefined;
  const pct = (i: number) => `${(i / (path.length - 1)) * 100}%`;
  const below = lowPoint.balance < 0;

  return (
    <figure className={styles.path} aria-label={t("overview.pathLabel", { amount: formatCurrency(lowPoint.balance), date: dayDate.format(lowPoint.date) })}>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden className={styles.svg}>
          <polygon points={area} className={styles.area} />
          {bottom < 0 && <line x1="0" x2={VIEW_W} y1={y(0)} y2={y(0)} className={styles.zero} vectorEffect="non-scaling-stroke" />}
          <polyline points={line} className={styles.line} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={`${styles.dot} ${below ? styles.dotBelow : styles.dotLow}`} style={{ left: pct(low), top: `${(y(lowPoint.balance) / VIEW_H) * 100}%` }} aria-hidden />
        {pay !== undefined && <span className={`${styles.dot} ${styles.dotPay}`} style={{ left: pct(pay), top: `${(y(path[pay].balance) / VIEW_H) * 100}%` }} aria-hidden />}
      </div>
      <figcaption className={styles.caption}>
        <span>{t("overview.pathToday")}</span>
        <span className={below ? styles.below : styles.lowText}>
          {t("overview.pathLow", { amount: formatCurrency(lowPoint.balance), date: dayDate.format(lowPoint.date) })}
        </span>
        <span>{pay !== undefined ? t("overview.pathPay") : dayDate.format(path[path.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}

export default PaydayPath;
