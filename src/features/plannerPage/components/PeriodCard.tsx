import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiClock } from "react-icons/fi";

import { heroSubline, planPeriods, SALARY_ROW_ID, type PlannerHorizon, type PlannerPlan } from "../plannerUtils";
import type { PlanSlice } from "../payCycles";
import { ZoomButton, ZoomModal } from "../../../shared/components/ChartZoom";
import HorizonPicker from "./HorizonPicker";
import PayCycleChart from "./PayCycleChart";
import PlanFlowChart from "./PlanFlowChart";
import styles from "../css/PlannerPage.module.css";

const VERDICT = {
  ok: { className: styles.verdictOk, Icon: FiCheckCircle, key: "planner.verdictOk" },
  tight: { className: styles.verdictTight, Icon: FiClock, key: "planner.verdictTight" },
  short: { className: styles.verdictShort, Icon: FiAlertTriangle, key: "planner.verdictShort" },
} as const;

/** From a year up, the chart's rows go to one line each. */
const COMPACT_FROM_MONTHS = 12;

interface PeriodCardProps {
  plan: PlannerPlan;
  cycles: PlanSlice[];
  horizon: PlannerHorizon;
  onHorizon: (horizon: PlannerHorizon) => void;
  /** Counting from a figure of your own: the ledger's first line says so. */
  scenario: boolean;
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  onOccurrence?: (key: string) => void;
}

/**
 * "The whole period": the second question, with its answer named.
 *
 * The page used to open on a large "393 €" with no label — income less
 * outgoings over the window, the money already there left out — which read
 * as money you would have, when the line went three weeks under zero on the
 * way. The figure here is what you end with, and says so, on the day it is
 * true; what the months add on their own comes under it, as a sentence that
 * names what it leaves out.
 *
 * The verdict is the running balance's: whether it ever goes under zero, and
 * if it does, from which day, for what, and how deep. Then the chart, and the
 * subtraction that gives the figure, line by line.
 */
export function PeriodCard({ plan, cycles, horizon, onHorizon, scenario, now, formatCurrency, locale, onOccurrence }: PeriodCardProps) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  const periods = useMemo(() => planPeriods(plan), [plan]);
  const shortDate = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const dayDate = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }), [locale]);

  const verdict = VERDICT[plan.verdict];
  const line = heroSubline(plan);
  const subline =
    line.key === "planner.lowestPoint"
      ? t(line.key, { amount: formatCurrency(line.lowest), date: dayDate.format(line.lowestOn) })
      : t(line.key, { date: dayDate.format(line.date), name: line.name === SALARY_ROW_ID ? t("planner.salaryLabel") : line.name, amount: formatCurrency(line.lowest), lowDate: dayDate.format(line.lowestOn) });

  const salaries = plan.events.filter((e) => e.label === SALARY_ROW_ID && e.amount > 0);
  const salaryTotal = Math.round(salaries.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const otherIncome = Math.round((plan.incomeTotal - salaryTotal) * 100) / 100;
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

  // What went out, by the same groups as the levers below, empty ones left out.
  const outParts = [
    [t("planner.groupBills"), plan.billsTotal],
    [t("planner.groupGoals"), plan.goalsTotal],
    [t("debts.plannerGroup"), plan.debtsTotal],
    [t("planner.groupMine"), plan.budgetTotal],
  ].filter(([, amount]) => (amount as number) > 0) as [string, number][];

  return (
    <section className="card mb-3" aria-label={t("planner.wholePeriod")}>
      <div className="card-body p-3 p-sm-4">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className={styles.label}>{t("planner.wholePeriod")}</span>
          <span className="d-flex align-items-center gap-1 small text-body-secondary">
            {shortDate.format(plan.start)} – {dayDate.format(plan.end)}
            {/* Not the same drawing enlarged: given the room, the months' two
                sides apart, which is what says why a period is tight. */}
            <ZoomButton onClick={() => setZoomed(true)} label={t("planner.flowTitle")} />
          </span>
        </div>

        <HorizonPicker horizon={horizon} onChange={onHorizon} />

        <div className={styles.endLabel}>{t("planner.endWith")}</div>
        <div className="d-flex align-items-baseline column-gap-2 flex-wrap">
          <span className={styles.endFigure} style={{ color: plan.endingBalance < 0 ? "var(--color-expense-text)" : undefined }}>
            {formatCurrency(plan.endingBalance)}
          </span>
          <span className="small text-body-secondary">{t("planner.onDate", { date: dayDate.format(plan.end) })}</span>
        </div>
        <p className="small text-body-secondary mb-0">{t("planner.monthsLeave", { amount: signed(plan.net), have: formatCurrency(plan.openingBalance) })}</p>

        <div className={`${styles.periodVerdict} ${verdict.className}`}>
          <span className="d-inline-flex align-items-center gap-2 fw-semibold">
            <verdict.Icon size={15} aria-hidden />
            {t(verdict.key)}
          </span>
          <span className={styles.periodSubline}>{subline}</span>
        </div>

        <PayCycleChart key={`${plan.months}-${cycles[0]?.kind}`} slices={cycles} compact={plan.months >= COMPACT_FROM_MONTHS} today={now} formatCurrency={formatCurrency} locale={locale} onOccurrence={onOccurrence} />

        {/* The subtraction behind the figure, quiet under the chart. */}
        <div className={styles.ledger}>
          <div className={styles.ledgerRow}>
            <span>{t(scenario ? "planner.scenarioIf" : "planner.openingBalance")}</span>
            <span className={styles.ledgerValue}>{formatCurrency(plan.openingBalance)}</span>
          </div>
          <div className={styles.ledgerRow}>
            <span>{salaries.length > 0 ? `${t("planner.moneyIn")} · ${t("planner.salaries", { count: salaries.length })}` : t("planner.moneyIn")}</span>
            <span className={styles.ledgerValue}>{signed(plan.incomeTotal)}</span>
          </div>
          {salaries.length > 0 && otherIncome > 0 && (
            <p className={styles.ledgerParts}>
              {t("planner.incomeSplit", { salary: formatCurrency(salaryTotal), other: formatCurrency(otherIncome) })}
            </p>
          )}
          <div className={styles.ledgerRow}>
            <span>{t("planner.moneyOut")}</span>
            <span className={styles.ledgerValue}>{signed(-plan.outgoingTotal)}</span>
          </div>
          {outParts.length > 0 && <p className={styles.ledgerParts}>{outParts.map(([name, amount]) => `${name} ${formatCurrency(amount)}`).join(" · ")}</p>}
          <div className={`${styles.ledgerRow} ${styles.ledgerEnd}`}>
            <span>{t("planner.endWith")}</span>
            <span className={styles.ledgerValue} style={{ color: plan.endingBalance < 0 ? "var(--color-expense-text)" : undefined }}>
              {formatCurrency(plan.endingBalance)}
            </span>
          </div>
        </div>
      </div>

      {zoomed && (
        <ZoomModal open onClose={() => setZoomed(false)} title={t("planner.flowTitle")} hint={t("planner.flowHint")}>
          <PlanFlowChart periods={periods} formatCurrency={formatCurrency} locale={locale} />
        </ZoomModal>
      )}
    </section>
  );
}

export default PeriodCard;
