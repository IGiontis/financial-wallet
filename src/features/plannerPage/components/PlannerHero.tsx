import { useMemo, useState } from "react";
import { getDaysInMonth } from "date-fns";
import { Input, InputGroup, InputGroupText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiClock } from "react-icons/fi";

import { type PlannerHorizon, type PlannerPlan } from "../plannerUtils";
import { ZoomButton, ZoomModal } from "../../../shared/components/ChartZoom";
import HorizonPicker from "./HorizonPicker";
import { BalanceLine } from "../BalanceLine";
import styles from "../css/PlannerPage.module.css";

const VERDICT = {
  ok: { className: styles.heroOk, Icon: FiCheckCircle },
  tight: { className: styles.heroTight, Icon: FiClock },
  short: { className: styles.heroShort, Icon: FiAlertTriangle },
} as const;

interface PlannerHeroProps {
  plan: PlannerPlan;
  horizon: PlannerHorizon;
  onHorizon: (horizon: PlannerHorizon) => void;
  selectedDay: number;
  onSelectDay: (index: number) => void;
  /** Net of the user's own monthly lines, for the "nothing happens today" reading. */
  monthlyLineNet: number;
  openingInput: string;
  onOpening: (value: string) => void;
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
  selectedDay,
  onSelectDay,
  monthlyLineNet,
  openingInput,
  onOpening,
  baseCurrency,
  formatCurrency,
  dateFmt,
}: PlannerHeroProps) {
  const { t, i18n } = useTranslation();
  const { className: tone, Icon } = VERDICT[plan.verdict];
  const [zoomed, setZoomed] = useState(false);
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
  const eventLabel = (label: string, isIncome: boolean) => (isIncome ? t("planner.salaryLabel") : label);

  // A point that stands for a whole month is named by the month. Printing "30
  // Nov" over a list of everything that happened in November would be a date
  // that is true and misleading at once.
  const pointLabel = (date: Date) => (plan.pointStep === "day" ? dateFmt.format(date) : periodFmt.format(date));

  // One element, drawn in the card and again in the sheet — a second copy would
  // be two drawings to keep in step.
  const line = <BalanceLine points={plan.points} breaksOnIndex={breaksOnIndex} selectedIndex={selectedDay} onSelect={onSelectDay} ariaLabel={t("planner.balanceTitle")} />;

  return (
    <section className={`${styles.hero} ${tone}`}>
      {/* Beside the number it changes, not in the page header. */}
      <HorizonPicker
        horizon={horizon}
        onChange={(next) => {
          onHorizon(next);
          // The selected day was an index into the old window's points.
          onSelectDay(-1);
        }}
      />

      <div className={styles.heroVerdict}>
        <Icon size={17} aria-hidden />
        {headline}
      </div>
      <div className={styles.heroAmount}>{formatCurrency(amount)}</div>
      <div className={styles.heroSub}>{subline}</div>

      <div className={styles.chartBox}>{line}</div>

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

      {/* Tapping any day explains that day rather than leaving the line to be
          read by eye. */}
      {selectedPoint ? (
        <div className={styles.dayDetail}>
          <div className="d-flex justify-content-between align-items-baseline gap-2">
            <span className="fw-semibold" style={{ fontSize: 12.5 }}>
              {pointLabel(selectedPoint.date)}
            </span>
            <span
              className="fw-semibold"
              style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", color: selectedPoint.balance < 0 ? "var(--color-expense-text)" : "var(--color-text-primary)" }}
            >
              {formatCurrency(selectedPoint.balance)}
            </span>
          </div>
          {selectedPoint.events.length === 0 ? (
            <p className="text-body-secondary mb-0" style={{ fontSize: 11.5 }}>
              {t("planner.justBudget", { amount: formatCurrency(Math.abs(monthlyLineNet) / getDaysInMonth(selectedPoint.date)) })}
            </p>
          ) : (
            selectedPoint.events.map((event, i) => (
              <div key={i} className="d-flex justify-content-between gap-2" style={{ fontSize: 11.5 }}>
                <span className="text-truncate">{eventLabel(event.label, event.kind === "income")}</span>
                <span style={{ color: event.amount > 0 ? "var(--color-income-text)" : "var(--color-expense-text)", fontVariantNumeric: "tabular-nums" }}>
                  {event.amount > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(event.amount))}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <p className={styles.tapHint}>{t("planner.tapHint")}</p>
      )}

      {/* The arithmetic behind the headline, kept quiet underneath it rather
          than given a card of its own. */}
      <div className={styles.heroLedger}>
        <div className={styles.ledgerRow}>
          <span>{t("planner.openingBalance")}</span>
          <div style={{ width: 128, flexShrink: 0 }}>
            <InputGroup size="sm">
              <InputGroupText>{baseCurrency}</InputGroupText>
              <Input type="number" inputMode="decimal" placeholder="0" value={openingInput} onChange={(e) => onOpening(e.target.value)} aria-label={t("planner.openingBalance")} />
            </InputGroup>
          </div>
        </div>
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

      {zoomed && (
        <ZoomModal open onClose={() => setZoomed(false)} title={t("planner.balanceTitle")} hint={t("planner.tapHint")}>
          {line}
        </ZoomModal>
      )}
    </section>
  );
}

export default PlannerHero;
