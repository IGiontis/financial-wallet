import { useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, isSameMonth } from "date-fns";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiXCircle } from "react-icons/fi";
import { Input } from "reactstrap";
import type { PlanMonth } from "../planMonthView";
import { ViewSwitch } from "../../../shared/components/ViewSwitch";

import type { PaydayOutlook } from "../../overview/overviewTabs";
import type { PlannerHorizon, PlannerPlan } from "../plannerUtils";
import HorizonPicker from "./HorizonPicker";
import { ZoomButton } from "../../../shared/components/ChartZoom";
import { BalanceScrub } from "./BalanceScrub";
import BalanceSheet from "./BalanceSheet";
import styles from "../css/PlannerPage.module.css";

/** Which sheet a tile opens: the pay-day answer in full, or the whole period. */
export type PlannerSheet = "payday" | "period" | "questions";

/** The whole window, as the horizon sets it; or one calendar month of it. */
export type PlannerView = "range" | "month";

interface PlannerTilesProps {
  plan: PlannerPlan;
  outlook: PaydayOutlook;
  horizon: PlannerHorizon;
  onHorizon: (horizon: PlannerHorizon) => void;
  /** Counting from a figure of your own: the first tile says so. */
  scenario: boolean;
  /** Pay the plan is waiting to be told about. */
  questions: number;
  onOpen: (sheet: PlannerSheet) => void;
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  cardRef?: Ref<HTMLDivElement>;
  view: PlannerView;
  onView: (view: PlannerView) => void;
  /** The month shown in «Μήνας», its first day. */
  month: Date;
  onMonth: (month: Date) => void;
  /** The months that can be shown: this one to the farthest a plan reaches. */
  months: { first: Date; last: Date };
  /** The month's figures and line; undefined while the plan for it is not there. */
  monthData?: PlanMonth;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * The Planner at a glance: four figures and the line between them.
 *
 * What you have, what is left on the eve of pay day, the lowest the balance
 * goes, and what you end with — each a tile, whose eye opens the full working
 * behind it. The sentences that used to sit around these figures (where the
 * money comes from, how the bar splits, what the months add without what you
 * have) are all still there, one tap in, as are the questions about pay that
 * may already have arrived: here they are one line saying how many.
 */
export function PlannerTiles({ plan, outlook, horizon, onHorizon, scenario, questions, onOpen, now, formatCurrency, locale, cardRef, view, onView, month, onMonth, months, monthData }: PlannerTilesProps) {
  const { t } = useTranslation();
  // The eye on the line: every day something lands, and what is left after it.
  const [chartOpen, setChartOpen] = useState(false);
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  // The eve of pay day, as the answer is dated on the Overview: the figure is
  // what is left at the end of that day. Pay held on today has no eve.
  const eve = !outlook.known
    ? outlook.date
    : startOfDay(outlook.date).getTime() <= startOfDay(now).getTime()
      ? now
      : new Date(outlook.date.getFullYear(), outlook.date.getMonth(), outlook.date.getDate() - 1);
  const makesIt = outlook.lowest >= 0;
  const red = (n: number) => (n < 0 ? "var(--color-expense-text)" : undefined);
  const VerdictIcon = plan.verdict === "short" ? FiAlertTriangle : plan.verdict === "tight" ? FiClock : FiCheckCircle;

  const tiles = [
    {
      key: "now",
      label: t(scenario ? "planner.scenarioIf" : "planner.tileHave"),
      value: formatCurrency(plan.openingBalance),
      color: red(plan.openingBalance),
      sub: t(scenario ? "planner.tileHaveMine" : "planner.tileHaveBanks"),
      sheet: "payday" as const,
      scenario,
    },
    {
      key: "payday",
      label: t(outlook.known ? "planner.tilePayday" : "planner.tileMonthEnd"),
      icon: makesIt ? <FiCheckCircle size={13} aria-hidden /> : <FiXCircle size={13} aria-hidden />,
      iconColor: makesIt ? "var(--color-income-text)" : "var(--color-expense-text)",
      value: formatCurrency(outlook.left),
      color: red(outlook.left),
      sub: dayDate.format(eve),
      sheet: "payday" as const,
    },
    {
      key: "lowest",
      label: t("planner.tileLowest"),
      icon: <VerdictIcon size={13} aria-hidden />,
      iconColor: plan.verdict === "ok" ? "var(--color-income-text)" : plan.verdict === "tight" ? "var(--color-goal-text)" : "var(--color-expense-text)",
      value: formatCurrency(plan.lowestBalance),
      color: red(plan.lowestBalance),
      sub: dayDate.format(plan.lowestOn),
      sheet: "period" as const,
    },
    {
      key: "end",
      label: t("planner.endWith"),
      value: formatCurrency(plan.endingBalance),
      color: red(plan.endingBalance),
      sub: dayDate.format(plan.end),
      sheet: "period" as const,
    },
  ];

  // «Μήνας»: what the month starts with, what comes and goes, what it ends
  // with — the month list's own figures. This month starts from today.
  const isMonth = view === "month" && !!monthData;
  const monthTiles = monthData
    ? [
        { key: "start", label: t(isSameMonth(month, now) ? "planner.monthFromToday" : "planner.monthStart"), value: formatCurrency(monthData.slice.carried), color: red(monthData.slice.carried) },
        { key: "in", label: t("planner.monthIn"), value: `+${formatCurrency(monthData.in)}`, color: "var(--color-income-text)" },
        { key: "out", label: t("planner.monthOut"), value: `−${formatCurrency(monthData.out)}`, color: undefined },
        { key: "end", label: t("planner.monthEnd"), value: formatCurrency(monthData.slice.close), color: red(monthData.slice.close) },
      ]
    : [];
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  // The month out of «Οκτώβριος 2026»: on its own Greek gives «Οκτωβρίου», the genitive of a date.
  const monthNames = Array.from({ length: 12 }, (_, m) => monthFmt.formatToParts(new Date(2024, m, 1)).find((part) => part.type === "month")!.value);
  const years = Array.from({ length: months.last.getFullYear() - months.first.getFullYear() + 1 }, (_, i) => months.first.getFullYear() + i);
  const [picking, setPicking] = useState(false);
  /** Kept inside the months a plan can show. */
  const clampMonth = (m: Date) => (m < months.first ? months.first : m > months.last ? months.last : m);
  const shown = isMonth ? monthData!.view : plan;

  return (
    <section ref={cardRef} className="card mb-3" aria-label={t("planner.glance")} data-tour="planner-glance">
      <div className="card-body p-3 p-sm-4">
        {/* «Διάστημα» the window the horizon sets, «Μήνας» one month of it, any month up to the farthest a plan reaches. */}
        <div className="mb-2">
          <ViewSwitch
            block
            label={t("planner.viewLabel")}
            value={view}
            onChange={onView}
            options={[
              { id: "range", label: t("planner.viewRange"), icon: FiClock },
              { id: "month", label: t("planner.viewMonth"), icon: FiCalendar },
            ]}
          />
        </div>

        {view === "range" ? (
          <>
            <div className="d-flex justify-content-between align-items-center gap-2">
              <span className={styles.label}>{t("planner.wholePeriod")}</span>
              <span className="small text-body-secondary">
                {shortDate.format(plan.start)} – {dayDate.format(plan.end)}
              </span>
            </div>
            <HorizonPicker horizon={horizon} onChange={onHorizon} now={now} locale={locale} />
          </>
        ) : (
          <div className={styles.monthNav}>
            <button type="button" className={styles.monthStep} onClick={() => onMonth(clampMonth(addMonths(month, -1)))} disabled={month <= months.first} aria-label={t("planner.monthPrev")}>
              <FiChevronLeft aria-hidden />
            </button>
            {picking ? (
              // Straight to any month: a year away is twelve taps of ‹ ›.
              <span className="d-flex gap-2">
                <Input type="select" bsSize="sm" className="w-auto" aria-label={t("planner.monthPickMonth")} value={month.getMonth()} onChange={(e) => onMonth(clampMonth(new Date(month.getFullYear(), Number(e.target.value), 1)))}>
                  {monthNames.map((name, m) => (
                    <option key={m} value={m}>
                      {name}
                    </option>
                  ))}
                </Input>
                <Input type="select" bsSize="sm" className="w-auto" aria-label={t("planner.monthPickYear")} value={month.getFullYear()} onChange={(e) => onMonth(clampMonth(new Date(Number(e.target.value), month.getMonth(), 1)))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Input>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setPicking(false)}>
                  {t("common.done")}
                </button>
              </span>
            ) : (
              <button type="button" className={styles.monthName} onClick={() => setPicking(true)} aria-label={t("planner.monthPick", { month: monthFmt.format(month) })}>
                {monthFmt.format(month)}
              </button>
            )}
            <button type="button" className={styles.monthStep} onClick={() => onMonth(clampMonth(addMonths(month, 1)))} disabled={month >= months.last} aria-label={t("planner.monthNext")}>
              <FiChevronRight aria-hidden />
            </button>
          </div>
        )}

        {questions > 0 && (
          <button type="button" className={styles.questionsLine} onClick={() => onOpen("questions")}>
            <FiAlertTriangle size={14} aria-hidden />
            <span className="flex-grow-1 text-start">{t("planner.questionsWaiting", { count: questions })}</span>
            <FiChevronRight size={14} aria-hidden />
          </button>
        )}

        {isMonth ? (
          <>
            <div className={styles.tiles}>
              {monthTiles.map((tile) => (
                <div key={tile.key} className={styles.tile}>
                  <span className={styles.tileHead}>
                    <span className={styles.tileLabel}>{tile.label}</span>
                  </span>
                  <span className={styles.tileValue} style={{ color: tile.color }}>
                    {tile.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="small text-body-secondary mt-2 mb-0">
              {t("planner.monthLowest", { amount: formatCurrency(monthData!.slice.lowest), date: dayDate.format(monthData!.slice.lowestOn) })}
            </p>
          </>
        ) : (
        <div className={styles.tiles}>
          {tiles.map((tile) => (
            // The eye opens the working, as on every chart: the tile itself is a figure to read.
            <div key={tile.key} className={`${styles.tile} ${tile.scenario ? styles.tileScenario : ""}`}>
              <span className={styles.tileHead}>
                <span className={styles.tileLabel}>
                  {tile.icon && <span style={{ color: tile.iconColor }}>{tile.icon}</span>}
                  {tile.label}
                </span>
                <ZoomButton onClick={() => onOpen(tile.sheet)} label={t("planner.tileOpen", { label: tile.label, value: tile.value })} className={styles.tileEye} />
              </span>
              <span className={styles.tileValue} style={{ color: tile.color }}>
                {tile.value}
              </span>
              <span className={styles.tileSub}>{tile.sub}</span>
            </div>
          ))}
        </div>
        )}

        <div className={styles.chartHead}>
          <span className={styles.label}>{t("planner.balanceTitle")}</span>
          <ZoomButton onClick={() => setChartOpen(true)} label={t("planner.daysTitle")} />
        </div>
        {/* Keyed by the window: a selected day was an index into the old one. */}
        <BalanceScrub key={`${view}-${shown.start.getTime()}-${shown.end.getTime()}`} plan={shown} formatCurrency={formatCurrency} locale={locale} />
      </div>
      {chartOpen && <BalanceSheet plan={shown} onClose={() => setChartOpen(false)} formatCurrency={formatCurrency} locale={locale} />}
    </section>
  );
}

export default PlannerTiles;
