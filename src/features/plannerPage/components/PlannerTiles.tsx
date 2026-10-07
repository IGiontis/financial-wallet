import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiChevronRight, FiClock, FiXCircle } from "react-icons/fi";

import type { PaydayOutlook } from "../../overview/overviewTabs";
import type { PlannerHorizon, PlannerPlan } from "../plannerUtils";
import HorizonPicker from "./HorizonPicker";
import { ZoomButton } from "../../../shared/components/ChartZoom";
import { BalanceScrub } from "./BalanceScrub";
import styles from "../css/PlannerPage.module.css";

/** Which sheet a tile opens: the pay-day answer in full, or the whole period. */
export type PlannerSheet = "payday" | "period" | "questions";

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
export function PlannerTiles({ plan, outlook, horizon, onHorizon, scenario, questions, onOpen, now, formatCurrency, locale, cardRef }: PlannerTilesProps) {
  const { t } = useTranslation();
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

  return (
    <section ref={cardRef} className="card mb-3" aria-label={t("planner.glance")}>
      <div className="card-body p-3 p-sm-4">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className={styles.label}>{t("planner.wholePeriod")}</span>
          <span className="small text-body-secondary">
            {shortDate.format(plan.start)} – {dayDate.format(plan.end)}
          </span>
        </div>
        <HorizonPicker horizon={horizon} onChange={onHorizon} />

        {questions > 0 && (
          <button type="button" className={styles.questionsLine} onClick={() => onOpen("questions")}>
            <FiAlertTriangle size={14} aria-hidden />
            <span className="flex-grow-1 text-start">{t("planner.questionsWaiting", { count: questions })}</span>
            <FiChevronRight size={14} aria-hidden />
          </button>
        )}

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

        {/* Keyed by the window: a selected day was an index into the old one. */}
        <BalanceScrub key={`${plan.months}-${plan.end.getTime()}`} plan={plan} formatCurrency={formatCurrency} locale={locale} />
      </div>
    </section>
  );
}

export default PlannerTiles;
