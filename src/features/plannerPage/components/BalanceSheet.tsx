import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ZoomModal } from "../../../shared/components/ChartZoom";
import type { PlannerPlan } from "../plannerUtils";
import { planDays } from "../planDays";
import { BalanceScrub } from "./BalanceScrub";
import styles from "../css/PlannerPage.module.css";

/**
 * The eye on the balance line: the same line, and under it every day that
 * something lands — what, how much, and what is left at the end of the day.
 *
 * As on «Στατιστικά», what opens is the working rather than the drawing made
 * bigger. The line answers "where does it dip"; this answers "and why, and on
 * which day", without dragging a finger along it day by day.
 */
export function BalanceSheet({ plan, onClose, formatCurrency, locale }: { plan: PlannerPlan; onClose: () => void; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  const days = useMemo(() => planDays(plan), [plan]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }), [locale]);
  const signed = (n: number) => `${n > 0 ? "+" : "−"}${formatCurrency(Math.abs(n))}`;
  const tone = (n: number) => (n > 0 ? "var(--figure-income)" : "var(--figure-expense)");
  const red = (n: number) => (n < 0 ? "var(--color-expense-text)" : undefined);

  return (
    <ZoomModal open fit onClose={onClose} title={t("planner.balanceTitle")}>
      <BalanceScrub key={`${plan.months}-${plan.end.getTime()}`} plan={plan} formatCurrency={formatCurrency} locale={locale} />

      <div className={`${styles.label} mt-4`}>{t("planner.daysTitle")}</div>
      <p className="small text-body-secondary mb-2">{t("planner.daysHint")}</p>

      <ol className={styles.dayList}>
        <li className={styles.dayItem}>
          <div className={styles.dayHead}>
            <span>{t("planner.daysStart")}</span>
            <span style={{ color: red(plan.openingBalance) }}>{formatCurrency(plan.openingBalance)}</span>
          </div>
        </li>
        {days.map((day) => (
          <li key={day.date.getTime()} className={`${styles.dayItem} ${day.balance < 0 ? styles.dayUnder : ""}`}>
            <div className={styles.dayHead}>
              <span>{dayFmt.format(day.date)}</span>
              <span style={{ color: red(day.balance) }}>
                <span className={styles.dayLeft}>{t("planner.daysLeft")}</span> {formatCurrency(day.balance)}
              </span>
            </div>
            {day.events.map((event, i) => (
              <div key={i} className={styles.dayEvent}>
                <span className="text-truncate">{event.label}</span>
                <span style={{ color: tone(event.amount) }}>{signed(event.amount)}</span>
              </div>
            ))}
            {day.lines !== 0 && (
              <div className={styles.dayEvent}>
                <span className="text-truncate text-body-secondary">{t("planner.daysLines")}</span>
                <span style={{ color: tone(day.lines) }}>{signed(day.lines)}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {days.length === 0 && <p className="small text-body-secondary mb-0">{t("planner.daysEmpty")}</p>}
    </ZoomModal>
  );
}

export default BalanceSheet;
