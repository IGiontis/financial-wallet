import { useCallback, useMemo, useState } from "react";
import { getDaysInMonth } from "date-fns";
import { Input, InputGroup, InputGroupText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiClock } from "react-icons/fi";

import { planPeriods, SALARY_ROW_ID, type PlannerHorizon, type PlannerPlan } from "../plannerUtils";
import PlanFlowChart from "./PlanFlowChart";
import { ZoomButton, ZoomModal } from "../../../shared/components/ChartZoom";
import HorizonPicker from "./HorizonPicker";
import { BalanceLine } from "../BalanceLine";
import styles from "../css/PlannerPage.module.css";
import segmented from "../../../shared/css/Segmented.module.css";

const VERDICT = {
  ok: { className: styles.heroOk, Icon: FiCheckCircle },
  tight: { className: styles.heroTight, Icon: FiClock },
  short: { className: styles.heroShort, Icon: FiAlertTriangle },
} as const;

interface PlannerHeroProps {
  plan: PlannerPlan;
  horizon: PlannerHorizon;
  onHorizon: (horizon: PlannerHorizon) => void;
  /** Net of the user's own monthly lines, for the "nothing happens today" reading. */
  monthlyLineNet: number;
  openingInput: string;
  onOpening: (value: string) => void;
  /** Money you can spend now, from the bank readings — offered as the opening figure. */
  available?: number;
  /** Starting from the banks rather than from the typed figure. */
  fromBanks?: boolean;
  onOpeningSource?: (source: "banks" | "manual") => void;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
}

/**
 * The answer, and the story behind it, as one thing.
 *
 * This was three stacked cards: a verdict banner, a box of sums, and a chart.
 * Each carried the same weight as the editing panels below them, so nothing on
 * the page looked more important than anything else — and the one figure the
 * reader came for sat in a box the same size as an input.
 *
 * Now the verdict, the figure, the line it came from and the arithmetic under
 * it are a single block, with the horizon beside the number it changes rather
 * than in the page header two screens away.
 */
export function PlannerHero({
  plan,
  horizon,
  onHorizon,
  monthlyLineNet,
  openingInput,
  onOpening,
  available,
  fromBanks = false,
  onOpeningSource,
  baseCurrency,
  formatCurrency,
  dateFmt,
}: PlannerHeroProps) {
  const { t, i18n } = useTranslation();
  const { className: tone, Icon } = VERDICT[plan.verdict];
  const [zoomed, setZoomed] = useState(false);
  // Held here rather than by the page: dragging along the line changes it on
  // every point passed, and each change re-rendered every editor below.
  const [selectedDay, setSelectedDay] = useState(-1);
  // A month can hold a dozen bills and only two fit above the line; the rest
  // open on request, and close again when the finger moves on.
  const [allEvents, setAllEvents] = useState(false);
  const selectDay = useCallback((index: number) => {
    setSelectedDay(index);
    setAllEvents(false);
  }, []);
  const periods = useMemo(() => planPeriods(plan), [plan]);
  const periodFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", plan.pointStep === "month" ? { month: "long", year: "numeric" } : { day: "numeric", month: "short" }),
    [i18n.resolvedLanguage, plan.pointStep],
  );

  const headline = plan.verdict === "short" ? t("planner.verdictShort") : plan.verdict === "tight" ? t("planner.verdictTight") : t("planner.verdictOk");
  const amount = plan.verdict === "short" ? plan.shortfall : plan.surplus;

  // "Tight" means the months add up but the running total dips below zero on
  // the way, so the subline has to name the day and how deep — that is the
  // whole difference between it and a straight yes.
  const subline =
    plan.verdict === "tight" && plan.breaksOn
      ? plan.breakingEvent
        ? t("planner.dipsOnBill", { date: dateFmt.format(plan.breaksOn), name: plan.breakingEvent.label, amount: formatCurrency(plan.dip) })
        : t("planner.dipsOn", { date: dateFmt.format(plan.breaksOn), amount: formatCurrency(plan.dip) })
      : t("planner.untilDate", { date: dateFmt.format(plan.end), months: plan.months });

  // The first point at or after the day it breaks. An exact match only exists
  // while the line is sampled daily; on a monthly line the dip belongs to the
  // month that contains it.
  const breaksOnIndex = plan.breaksOn ? plan.points.findIndex((p) => p.date.getTime() >= plan.breaksOn!.getTime()) : -1;
  const selectedPoint = selectedDay >= 0 && selectedDay < plan.points.length ? plan.points[selectedDay] : undefined;
  const eventLabel = (label: string) => (label === SALARY_ROW_ID ? t("planner.salaryLabel") : label);

  // A point that stands for a whole month is named by the month. Printing "30
  // Nov" over a list of everything that happened in November would be a date
  // that is true and misleading at once. A week is named as the week it closes,
  // and the extra point kept for a dip below zero is one day, so it is dated.
  const pointLabel = (date: Date) => {
    if (plan.pointStep === "day") return dateFmt.format(date);
    const monthEnd = getDaysInMonth(date) === date.getDate();
    if (plan.pointStep === "month" && monthEnd) return periodFmt.format(date);
    if (plan.pointStep === "week" && date.getTime() !== plan.end.getTime()) return t("planner.weekTo", { date: periodFmt.format(date) });
    return dateFmt.format(date);
  };

  // Biggest first, since only a couple fit above the line.
  const shownEvents = selectedPoint ? [...selectedPoint.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) : [];
  const SHOWN = 2;

  return (
    <section className={`${styles.hero} ${tone}`}>
      {/* Beside the number it changes, not in the page header. */}
      <HorizonPicker
        horizon={horizon}
        onChange={(next) => {
          onHorizon(next);
          // The selected day was an index into the old window's points.
          selectDay(-1);
        }}
      />

      <div className={styles.heroVerdict}>
        <Icon size={17} aria-hidden />
        {headline}
      </div>
      <div className={styles.heroAmount}>{formatCurrency(amount)}</div>
      <div className={styles.heroSub}>{subline}</div>

      {/* Above the line rather than under it: while a finger is on the chart,
          anything below the chart is under the hand. Always the same height,
          so the chart does not jump as the figures in it change. */}
      <div className={styles.readout} aria-live="polite">
        {selectedPoint ? (
          <>
            <div className={styles.readoutMain}>
              <span className={styles.readoutDate}>{pointLabel(selectedPoint.date)}</span>
              <span className={styles.readoutValue} style={{ color: selectedPoint.balance < 0 ? "var(--color-expense-text)" : "var(--color-text-primary)" }}>
                {formatCurrency(selectedPoint.balance)}
              </span>
            </div>
            <div className={styles.readoutEvents}>
              {shownEvents.length === 0 ? (
                <span className="text-body-secondary">{t("planner.justBudget", { amount: formatCurrency(Math.abs(monthlyLineNet) / getDaysInMonth(selectedPoint.date)) })}</span>
              ) : (
                (allEvents ? shownEvents : shownEvents.slice(0, SHOWN)).map((event, i) => (
                  <span key={i} className={styles.readoutEvent}>
                    <span className="text-truncate">{eventLabel(event.label)}</span>
                    <span style={{ color: event.amount > 0 ? "var(--figure-income)" : "var(--figure-expense)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {event.amount > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(event.amount))}
                    </span>
                  </span>
                ))
              )}
              {shownEvents.length > SHOWN && !allEvents && (
                <button type="button" className={styles.readoutMore} onClick={() => setAllEvents(true)}>
                  {t("planner.moreEvents", { count: shownEvents.length - SHOWN })}
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
        selectedIndex={selectedDay}
        onSelect={selectDay}
        ariaLabel={t("planner.balanceTitle")}
        locale={i18n.resolvedLanguage ?? "en"}
      />

      <div className={styles.heroAxis}>
        <span>{t("planner.today")}</span>
        <span>{t("planner.perDay", { amount: formatCurrency(plan.safeDailySpend) })}</span>
        <span className="d-flex align-items-center gap-1">
          {dateFmt.format(plan.end)}
          {/* Three years of daily points in a card this size is a texture. The
              same line, given the screen, is a line again. */}
          <ZoomButton onClick={() => setZoomed(true)} />
        </span>
      </div>

      {/* The arithmetic behind the headline, kept quiet underneath it rather
          than given a card of its own. */}
      <div className={styles.heroLedger}>
        <div className={styles.ledgerRow}>
          <span>{t("planner.openingBalance")}</span>
          {fromBanks && available !== undefined ? (
            <span className={styles.ledgerValue}>{formatCurrency(available)}</span>
          ) : (
          <div style={{ width: 128, flexShrink: 0 }}>
            <InputGroup size="sm">
              <InputGroupText>{baseCurrency}</InputGroupText>
              <Input type="number" inputMode="decimal" placeholder="0" value={openingInput} onChange={(e) => onOpening(e.target.value)} aria-label={t("planner.openingBalance")} />
            </InputGroup>
          </div>
          )}
        </div>
        {/* Where the plan starts: what the banks hold, or a figure of your own
            for a "what if". Only offered once the banks have been read. */}
        {available !== undefined && onOpeningSource && (
          <div className={`${segmented.group} ${segmented.even} mb-2`} role="group" aria-label={t("planner.openingBalance")}>
            <button type="button" className={`${segmented.item} ${fromBanks ? segmented.active : ""}`} aria-pressed={fromBanks} onClick={() => onOpeningSource("banks")}>
              {t("planner.openingFromBanks")}
            </button>
            <button type="button" className={`${segmented.item} ${!fromBanks ? segmented.active : ""}`} aria-pressed={!fromBanks} onClick={() => onOpeningSource("manual")}>
              {t("planner.openingMine")}
            </button>
          </div>
        )}
        <div className={styles.ledgerRow}>
          <span>{t("planner.moneyIn")}</span>
          <span className={styles.ledgerValue} style={{ color: "var(--color-income-text)" }}>
            +{formatCurrency(plan.incomeTotal)}
          </span>
        </div>
        <div className={styles.ledgerRow}>
          <span>{t("planner.moneyOut")}</span>
          <span className={styles.ledgerValue} style={{ color: "var(--color-expense-text)" }}>
            −{formatCurrency(plan.outgoingTotal)}
          </span>
        </div>
        <div className={`${styles.ledgerRow} ${styles.ledgerEnd}`}>
          <span>{t("planner.endWith")}</span>
          <span className={styles.ledgerValue} style={{ color: plan.endingBalance < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>
            {formatCurrency(plan.endingBalance)}
          </span>
        </div>
      </div>

      {/* Not the same drawing enlarged. The card's line answers "do I stay above
          zero"; with the room of the whole dialog the question worth answering
          is why a period is tight, which needs the two sides drawn apart. */}
      {zoomed && (
        <ZoomModal open onClose={() => setZoomed(false)} title={t("planner.flowTitle")} hint={t("planner.flowHint")}>
          <PlanFlowChart periods={periods} formatCurrency={formatCurrency} locale={i18n.resolvedLanguage ?? "en"} />
        </ZoomModal>
      )}
    </section>
  );
}

export default PlannerHero;
