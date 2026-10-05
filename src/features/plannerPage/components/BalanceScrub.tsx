import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDaysInMonth } from "date-fns";
import { BalanceLine } from "../BalanceLine";
import type { PlannerPlan } from "../plannerUtils";
import styles from "../css/BalanceScrub.module.css";

/**
 * The running balance as a line you scrub with a finger, and above it the day
 * under the finger: its balance and what moved on it.
 *
 * Brought back by request. The pay-cycle bars that replaced it answered the
 * pay-day question well, but the owner reads the plan as a line — where it
 * dips, where it climbs, what it is on a given day — and found the line the
 * clearer picture. It sits in the whole-period card; the pay-day answer has a
 * card of its own above it, so the chart no longer has to carry that alone.
 *
 * The readout is above the line rather than under it: while a finger is on the
 * chart, anything below it is under the hand. It keeps one height, so the line
 * does not jump as the figures in it change.
 */
export function BalanceScrub({ plan, formatCurrency, locale }: { plan: PlannerPlan; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  // Held here rather than by the page: dragging along the line changes it on
  // every point passed, and each change would re-render every editor below.
  const [selected, setSelected] = useState(-1);
  // A month can hold a dozen bills and only two fit above the line; the rest
  // open on request, and close again when the finger moves on.
  const [allEvents, setAllEvents] = useState(false);
  const select = useCallback((index: number) => {
    setSelected(index);
    setAllEvents(false);
  }, []);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const periodFmt = useMemo(() => new Intl.DateTimeFormat(locale, plan.pointStep === "month" ? { month: "long", year: "numeric" } : { day: "numeric", month: "short" }), [locale, plan.pointStep]);

  // A window that changes shape (a new horizon) leaves an old index behind.
  const point = selected >= 0 && selected < plan.points.length ? plan.points[selected] : undefined;
  const breaksOnIndex = plan.breaksOn ? plan.points.findIndex((p) => p.date.getTime() >= plan.breaksOn!.getTime()) : -1;

  // A point that stands for a whole month is named by the month, a week by the
  // day it closes; a single day by its date.
  const pointLabel = (date: Date) => {
    if (plan.pointStep === "day") return dateFmt.format(date);
    if (plan.pointStep === "month" && getDaysInMonth(date) === date.getDate()) return periodFmt.format(date);
    if (plan.pointStep === "week" && date.getTime() !== plan.end.getTime()) return t("planner.weekTo", { date: periodFmt.format(date) });
    return dateFmt.format(date);
  };

  // Biggest first, since only a couple fit above the line.
  const events = point ? [...point.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) : [];
  const SHOWN = 2;
  // A day with nothing dated on it still moved: the budget lines run by the day.
  const lineSpend = point && plan.pointStep === "day" ? point.accruedOut - point.accruedIn : 0;

  return (
    <div>
      <div className={styles.readout} aria-live="polite">
        {point ? (
          <>
            <div className={styles.readoutMain}>
              <span className={styles.readoutDate}>{pointLabel(point.date)}</span>
              <span className={styles.readoutValue} style={{ color: point.balance < 0 ? "var(--color-expense-text)" : "var(--color-text-primary)" }}>
                {formatCurrency(point.balance)}
              </span>
            </div>
            <div className={styles.readoutEvents}>
              {events.length === 0 ? (
                lineSpend > 0 && <span className="text-body-secondary">{t("planner.justBudget", { amount: formatCurrency(lineSpend) })}</span>
              ) : (
                (allEvents ? events : events.slice(0, SHOWN)).map((event, i) => (
                  <span key={i} className={styles.readoutEvent}>
                    <span className="text-truncate">{event.label}</span>
                    <span style={{ color: event.amount > 0 ? "var(--figure-income)" : "var(--figure-expense)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {event.amount > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(event.amount))}
                    </span>
                  </span>
                ))
              )}
              {events.length > SHOWN && !allEvents && (
                <button type="button" className={styles.readoutMore} onClick={() => setAllEvents(true)}>
                  {t("planner.moreEvents", { count: events.length - SHOWN })}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className={styles.tapHint}>{t("planner.tapHint")}</p>
        )}
      </div>

      <BalanceLine
        points={plan.points}
        start={plan.start}
        end={plan.end}
        pointStep={plan.pointStep}
        breaksOnIndex={breaksOnIndex}
        selectedIndex={selected}
        onSelect={select}
        ariaLabel={t("planner.balanceTitle")}
        locale={locale}
      />

      <div className={styles.heroAxis}>
        <span>{t("planner.today")}</span>
        <span>{dateFmt.format(plan.end)}</span>
      </div>
    </div>
  );
}
