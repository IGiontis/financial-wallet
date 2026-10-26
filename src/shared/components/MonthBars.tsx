import { useMemo, type CSSProperties } from "react";
import styles from "../css/MonthBars.module.css";

/** One month of a run, as a bar: what lands in it, and of that what is already behind you. */
export interface MonthBar {
  /** First day of the month. */
  start: Date;
  total: number;
  /** Of `total`, the part already done — drawn striped. */
  paid?: number;
  /** What a pointer over the bar says. */
  title?: string;
}

/** The colour a month that stands out is drawn in — the meaning, not a hue. */
export type MonthBarTone = "income" | "expense" | "goal";

/**
 * A run of months, each as long as its figure: rows on a phone, columns from
 * `sm` up. Shared by «Πάγια» (what each month asks) and «Έσοδα» (what each
 * month brings), so the two read as one chart. The month that stands out at
 * each end is drawn in its tone; what they mean — dear or easy, rich or thin —
 * is the caller's to say.
 */
export function MonthBars({
  months,
  formatCurrency,
  locale,
  label,
  highs = [],
  lows = [],
  highTone,
  lowTone,
  onOpen,
  paidLegend,
}: {
  months: MonthBar[];
  formatCurrency: (n: number) => string;
  locale: string;
  label: string;
  /** The months that stand out at the top — several when they are tied. */
  highs?: MonthBar[];
  lows?: MonthBar[];
  highTone: MonthBarTone;
  lowTone: MonthBarTone;
  /** Opens that month's own breakdown; without it the bars are to read only. */
  onOpen?: (offset: number) => void;
  /** Said beside a striped swatch, when any month has a part already done. */
  paidLegend?: string;
}) {
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short" }), [locale]);
  const peak = months.reduce((most, month) => Math.max(most, month.total), 0);
  const anyPaid = months.some((month) => (month.paid ?? 0) > 0);
  // By the month, not the object: a caller may hand in copies with a title added.
  const isIn = (month: MonthBar, list: MonthBar[]) => list.some((m) => m.start.getTime() === month.start.getTime());
  const toneOf = (tone: MonthBarTone) => ({ ["--mark" as string]: `var(--color-${tone})`, ["--mark-text" as string]: `var(--color-${tone}-text)` }) as CSSProperties;

  return (
    <>
      <div className={styles.bars} role="group" aria-label={label}>
        {months.map((month, offset) => {
          const share = peak > 0 ? Math.max((month.total / peak) * 100, month.total > 0 ? 4 : 0) : 0;
          const paidShare = month.total > 0 ? Math.min(((month.paid ?? 0) / month.total) * 100, 100) : 0;
          const isHigh = isIn(month, highs);
          const isLow = !isHigh && isIn(month, lows);
          const mark = isHigh || isLow ? styles.marked : "";
          const style = { ["--fill" as string]: `${share}%`, ["--paid" as string]: `${paidShare}%`, ...(isHigh ? toneOf(highTone) : isLow ? toneOf(lowTone) : {}) } as CSSProperties;
          const body = (
            <>
              <span className={styles.month}>{monthFmt.format(month.start)}</span>
              <span className={styles.track}>
                <span className={styles.fill}>{paidShare > 0 && <span className={styles.paid} />}</span>
              </span>
              <span className={styles.amount}>{month.total > 0 ? formatCurrency(month.total) : "—"}</span>
            </>
          );
          return onOpen ? (
            <button key={month.start.toISOString()} type="button" className={`${styles.item} ${styles.pressable} ${mark}`} style={style} title={month.title} onClick={() => onOpen(offset)}>
              {body}
            </button>
          ) : (
            <div key={month.start.toISOString()} className={`${styles.item} ${mark}`} style={style} title={month.title}>
              {body}
            </div>
          );
        })}
      </div>

      {anyPaid && paidLegend && (
        <div className={styles.legend}>
          <span className={styles.swatch} aria-hidden />
          {paidLegend}
        </div>
      )}
    </>
  );
}

export default MonthBars;
