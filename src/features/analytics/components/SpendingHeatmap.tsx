import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Heatmap } from "../analyticsUtils";
import { weekdayNames } from "./chartTheme";
import styles from "./css/Analytics.module.css";

/** Five steps. A linear ramp would leave almost every day in the palest band,
 *  because one rent payment dwarfs a month of groceries — the square root pulls
 *  the ordinary days apart where the eye can actually see the difference. */
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.68, 1];

function levelFor(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  const scaled = Math.sqrt(amount / max);
  if (scaled <= 0.25) return 1;
  if (scaled <= 0.5) return 2;
  if (scaled <= 0.75) return 3;
  return 4;
}

const cellStyle = (level: number) => (level === 0 ? undefined : { background: "var(--color-expense)", opacity: LEVEL_OPACITY[level] });

export default function SpendingHeatmap({ heatmap, formatCurrency, locale }: { heatmap: Heatmap; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();

  const { dayNames, monthFor, dateFor } = useMemo(() => {
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    return {
      dayNames: weekdayNames(locale),
      monthFor: (d: Date) => monthFmt.format(d),
      dateFor: (d: Date) => dateFmt.format(d),
    };
  }, [locale]);

  return (
    <div className="d-flex flex-column h-100">
      <div className={styles.heatWrap}>
        <div className={styles.heatDays}>
          {dayNames.map((name) => (
            <span key={name} className={styles.heatDayLabel}>
              {name}
            </span>
          ))}
        </div>

        <div className={styles.heatScroll}>
          <div className={styles.heatColumns}>
            {heatmap.weeks.map((week, w) => {
              const previous = heatmap.weeks[w - 1];
              // Label a column only when its month differs from the one before,
              // so each month is named once, above the week it starts in.
              const showMonth = w === 0 || previous.start.getMonth() !== week.start.getMonth();

              return (
                <div key={week.start.toISOString()} className={styles.heatColumn}>
                  <span className={styles.heatMonth}>{showMonth ? monthFor(week.start) : ""}</span>

                  {week.days.map((day, d) =>
                    day === null ? (
                      <span key={d} className={`${styles.heatCell} ${styles.heatBlank}`} />
                    ) : (
                      <span
                        key={d}
                        className={styles.heatCell}
                        style={cellStyle(levelFor(day.amount, heatmap.max))}
                        title={`${dateFor(day.date)} · ${day.amount > 0 ? formatCurrency(day.amount) : t("analytics.heatmap.nothing")}`}
                      />
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.heatLegend}>
        <span>{t("analytics.heatmap.less")}</span>
        {LEVEL_OPACITY.map((_, level) => (
          <span key={level} className={`${styles.heatCell} ${styles.heatLegendCell}`} style={cellStyle(level)} />
        ))}
        <span>{t("analytics.heatmap.more")}</span>
      </div>
    </div>
  );
}
