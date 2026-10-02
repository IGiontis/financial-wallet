import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiChevronUp, FiXCircle } from "react-icons/fi";

import type { PaydayOutlook } from "../../overview/overviewTabs";
import styles from "../css/PlannerPage.module.css";

interface AnswerStripProps {
  outlook: PaydayOutlook;
  endingBalance: number;
  end: Date;
  /** Counting from a figure of your own: drawn in the scenario's dashed frame. */
  scenario: boolean;
  /** Back up to the full card. */
  onOpen: () => void;
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
}

/**
 * The two answers, pinned to the top once the card that gives them has
 * scrolled away.
 *
 * Most of the work on this page happens further down — switching a bill off,
 * typing next month's food — and every one of those changes the answer at the
 * top, which by then is a screen and a half above. The strip keeps both
 * figures in sight while you work: what is left before pay, and what you end
 * with. Tapping it takes you back up to the card it summarises.
 *
 * Shown only while the card is out of sight, so it never sits on top of the
 * figures it repeats.
 */
export function AnswerStrip({ outlook, endingBalance, end, scenario, onOpen, now, formatCurrency, locale }: AnswerStripProps) {
  const { t } = useTranslation();
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const makesIt = outlook.lowest >= 0;
  // The evening the figure is for: the day before pay, or the month's last —
  // or today, when the pay itself is due today and nothing comes between.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayBefore = new Date(outlook.date.getFullYear(), outlook.date.getMonth(), outlook.date.getDate() - 1);
  const eve = !outlook.known ? outlook.date : dayBefore < today ? today : dayBefore;
  const heading = makesIt ? t(outlook.known ? "planner.stripToPay" : "planner.stripToMonthEnd") : t(outlook.known ? "overview.verdictShort" : "overview.verdictShortMonth");

  return (
    <div className={styles.stripDock}>
      <button type="button" className={`${styles.strip} ${scenario ? styles.stripScenario : ""}`} onClick={onOpen} title={t("planner.stripOpen")}>
        <span className={styles.stripCol}>
          <small className={styles.stripHeading} style={{ color: makesIt ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
            {makesIt ? <FiCheckCircle size={13} aria-hidden /> : <FiXCircle size={13} aria-hidden />} {heading}
          </small>
          <b style={{ color: outlook.left < 0 ? "var(--color-expense-text)" : undefined }}>{formatCurrency(outlook.left)}</b>
          <small>{makesIt ? t("planner.stripEve", { date: dayDate.format(eve), perDay: formatCurrency(outlook.perDay) }) : dayDate.format(eve)}</small>
        </span>
        <span className={styles.stripCol}>
          <small className={styles.stripHeading}>{t("planner.endWith")}</small>
          <b style={{ color: endingBalance < 0 ? "var(--color-expense-text)" : undefined }}>{formatCurrency(endingBalance)}</b>
          <small>{t("planner.onDate", { date: dayDate.format(end) })}</small>
        </span>
        <FiChevronUp size={16} className="flex-shrink-0 text-body-secondary" aria-hidden />
      </button>
    </div>
  );
}

export default AnswerStrip;
