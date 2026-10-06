import { useMemo, useState } from "react";
import { Table } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiClock } from "react-icons/fi";

import { heroSubline, planPeriods, type PlannerHorizon, type PlannerPlan } from "../plannerUtils";
import { isPay } from "../payCycles";
import { ZoomButton, ZoomModal } from "../../../shared/components/ChartZoom";
import HorizonPicker from "./HorizonPicker";
import { BalanceScrub } from "./BalanceScrub";
import PlanFlowChart from "./PlanFlowChart";
import styles from "../css/PlannerPage.module.css";

const VERDICT = {
  ok: { className: styles.verdictOk, Icon: FiCheckCircle, key: "planner.verdictOk" },
  tight: { className: styles.verdictTight, Icon: FiClock, key: "planner.verdictTight" },
  short: { className: styles.verdictShort, Icon: FiAlertTriangle, key: "planner.verdictShort" },
} as const;

/** From a year up, the chart's rows go to one line each. */

interface PeriodCardProps {
  plan: PlannerPlan;
  horizon: PlannerHorizon;
  onHorizon: (horizon: PlannerHorizon) => void;
  /** Counting from a figure of your own: the ledger's first line says so. */
  scenario: boolean;
  formatCurrency: (n: number) => string;
  locale: string;
  /** In the sheet behind the tiles: no card around it, no horizon picker
   *  (the tiles hold it), and the months drawn and listed in place. */
  inSheet?: boolean;
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
export function PeriodCard({ plan, horizon, onHorizon, scenario, formatCurrency, locale, inSheet }: PeriodCardProps) {
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
      : t(line.key, { date: dayDate.format(line.date), name: line.name, amount: formatCurrency(line.lowest), lowDate: dayDate.format(line.lowestOn) });

  const salaries = plan.events.filter(isPay);
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

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" });

  return (
    <section className={inSheet ? undefined : "card mb-3"} aria-label={t("planner.wholePeriod")}>
      <div className={inSheet ? undefined : "card-body p-3 p-sm-4"}>
        <div className="d-flex justify-content-between align-items-center gap-2">
          {/* In the sheet the dialog's own title already says it. */}
          {!inSheet && <span className={styles.label}>{t("planner.wholePeriod")}</span>}
          <span className="d-flex align-items-center gap-1 small text-body-secondary">
            {shortDate.format(plan.start)} – {dayDate.format(plan.end)}
            {/* Not the same drawing enlarged: given the room, the months' two
                sides apart, which is what says why a period is tight. */}
            {!inSheet && <ZoomButton onClick={() => setZoomed(true)} label={t("planner.flowTitle")} />}
          </span>
        </div>

        {!inSheet && <HorizonPicker horizon={horizon} onChange={onHorizon} />}

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

        {/* Keyed by the window: a selected day was an index into the old one. */}
        {/* In the sheet the line is already on the page, under the tiles. */}
        {!inSheet && <BalanceScrub key={`${plan.months}-${plan.end.getTime()}`} plan={plan} formatCurrency={formatCurrency} locale={locale} />}

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

        {inSheet && (
          <>
            <div className={`${styles.label} mt-4`}>{t("planner.flowTitle")}</div>
            <p className="small text-body-secondary mb-0">{t("planner.flowHint")}</p>
            <div className={styles.sheetChart}>
              <PlanFlowChart periods={periods} formatCurrency={formatCurrency} locale={locale} />
            </div>

            <div className={`${styles.label} mt-4 mb-1`}>{t("planner.periodsTitle")}</div>
            <Table size="sm" hover responsive borderless className={`${styles.sheetTable} mb-0`}>
              <thead>
                <tr>
                  <th scope="col">{t("planner.colPeriod")}</th>
                  <th scope="col" className="text-end">
                    {t("planner.moneyIn")}
                  </th>
                  <th scope="col" className="text-end">
                    {t("planner.moneyOut")}
                  </th>
                  <th scope="col" className="text-end">
                    {t("planner.colBalance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.key}>
                    <th scope="row" className="fw-semibold">
                      {monthFmt.format(period.start)}
                    </th>
                    <td className="text-end" style={{ color: period.income > 0 ? "var(--color-income-text)" : undefined }}>
                      {signed(period.income)}
                    </td>
                    <td className="text-end" style={{ color: period.outgoing > 0 ? "var(--color-expense-text)" : undefined }}>
                      {signed(-period.outgoing)}
                    </td>
                    <td className="text-end fw-semibold" style={{ color: period.balance < 0 ? "var(--color-expense-text)" : undefined }}>
                      {formatCurrency(period.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
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
