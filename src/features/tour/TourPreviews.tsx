import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertCircle, FiAlertTriangle, FiCheck, FiClock, FiDatabase, FiPlus, FiTarget } from "react-icons/fi";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import styles from "./css/WelcomeTour.module.css";

// Small drawings of the app's pages for the welcome tour: the same colours and
// shapes as the real thing, with made-up figures — nothing here reads or
// writes anything. Drawn rather than photographed, so each follows the language
// and the theme on screen, and none goes stale the way a screenshot would.

/** A line of a list: its mark, its name and note, its figure. */
function Line({ icon, name, note, amount, tone }: { icon: ReactNode; name: string; note?: string; amount: string; tone?: "in" | "out" | "late" | "soon" }) {
  return (
    <div className={styles.line}>
      <span className={`${styles.lineIcon} ${tone ? styles[tone] : ""}`}>{icon}</span>
      <span className={styles.lineText}>
        <b>{name}</b>
        {note && <small className={tone === "late" || tone === "soon" ? styles[tone] : undefined}>{note}</small>}
      </span>
      <span className={`${styles.lineAmount} ${tone === "in" ? styles.in : tone === "late" ? styles.late : ""}`}>{amount}</span>
    </div>
  );
}

export function OverviewPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <small>{t("tour.demo.in")}</small>
          <b className={styles.in}>{format(1450)}</b>
        </div>
        <div className={styles.tile}>
          <small>{t("tour.demo.out")}</small>
          <b className={styles.late}>{format(612.4)}</b>
        </div>
        <div className={styles.tile}>
          <small>{t("tour.demo.net")}</small>
          <b>+{format(837.6)}</b>
        </div>
      </div>
      <div className={styles.bar}>
        <span style={{ width: "42%" }} className={styles.barOut} />
        <span style={{ width: "58%" }} className={styles.barIn} />
      </div>
    </div>
  );
}

export function QuickPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={`${styles.preview} ${styles.relative}`}>
      <div className={styles.chips}>
        <span className={`${styles.chip} ${styles.chipOn}`}>☕ {t("tour.demo.coffee")} {format(3.5)}</span>
        <span className={styles.chip}>🛒 {t("tour.demo.market")}</span>
        <span className={styles.chip}>⛽ {t("tour.demo.fuel")}</span>
      </div>
      <div className={styles.amount}>{format(3.5)}</div>
      <span className={styles.fab} aria-hidden>
        <FiPlus />
      </span>
    </div>
  );
}

export function TransactionsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <div className={styles.dayHead}>
        <span>{t("tour.demo.today")}</span>
        <span className={styles.late}>−{format(46.8)}</span>
      </div>
      <Line icon="🛒" name={t("tour.demo.market")} note="Eurobank" amount={`−${format(42.3)}`} tone="out" />
      <Line icon="☕" name={t("tour.demo.coffee")} note="Revolut" amount={`−${format(4.5)}`} tone="out" />
      <div className={styles.catBar}>
        <span>🛒 {t("tour.demo.market")}</span>
        <i style={{ width: "70%" }} />
      </div>
    </div>
  );
}

export function BillsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <Line icon={<FiAlertCircle />} name={t("tour.demo.power")} note={t("tour.demo.lateBy")} amount={format(85)} tone="late" />
      <Line icon={<FiAlertTriangle />} name={t("tour.demo.water")} note={t("tour.demo.inDays")} amount={format(30)} tone="soon" />
      <Line icon={<FiCheck />} name={t("tour.demo.rent")} note={t("tour.demo.paid")} amount={format(450)} />
    </div>
  );
}

export function IncomesPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <div className={styles.incomeRow}>
        <span className={styles.lineIcon}>💼</span>
        <span className={styles.lineText}>
          <b>{t("tour.demo.salary")}</b>
          <small>{t("tour.demo.onThe30th")}</small>
        </span>
        <span className={styles.lineAmount}>{format(1450)}</span>
        <span className={styles.cameButton}>
          <FiCheck /> {t("tour.demo.came")}
        </span>
      </div>
      <Line icon="🏠" name={t("tour.demo.rentIn")} note={t("tour.demo.waiting")} amount={format(400)} tone="soon" />
    </div>
  );
}

export function GoalsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  const pct = 0.36;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.preview}>
      <div className={styles.goalTop}>
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className={styles.ring}>
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className={styles.ringTrack} />
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className={styles.ringFill} />
        </svg>
        <span className={styles.ringPct}>36%</span>
        <div className={styles.lineText}>
          <b>✈️ {t("tour.demo.trip")}</b>
          <small>
            {t("tour.demo.perMonth")} {format(120)}
          </small>
        </div>
      </div>
      <div className={styles.tiles}>
        <div className={`${styles.tile} ${styles.tileIn}`}>
          <FiDatabase aria-hidden />
          <b>{format(720)}</b>
          <small>{t("goals.boxIn")}</small>
        </div>
        <div className={`${styles.tile} ${styles.tileLeft}`}>
          <FiClock aria-hidden />
          <b>{format(1280)}</b>
          <small>{t("goals.boxLeft")}</small>
        </div>
        <div className={`${styles.tile} ${styles.tileAll}`}>
          <FiTarget aria-hidden />
          <b>{format(2000)}</b>
          <small>{t("goals.boxTarget")}</small>
        </div>
      </div>
    </div>
  );
}

export function BanksPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <Line icon="🏦" name="Eurobank" amount={format(1820)} />
      <Line icon="💳" name="Revolut" amount={format(240.5)} />
      <Line icon="💶" name={t("tour.demo.cash")} amount={format(60)} />
      <div className={styles.gap}>
        <span>{t("tour.demo.unlogged")}</span>
        <b className={styles.soon}>−{format(23.4)}</b>
      </div>
    </div>
  );
}

export function PlannerPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  // A month's money falling as bills go and rising on payday.
  const points = [70, 64, 60, 52, 50, 88, 80, 72, 66, 62];
  return (
    <div className={styles.preview}>
      <svg viewBox="0 0 200 70" className={styles.planner} aria-hidden preserveAspectRatio="none">
        <polyline points={points.map((y, i) => `${(i / (points.length - 1)) * 200},${100 - y}`).join(" ")} fill="none" strokeWidth="2.5" />
      </svg>
      <div className={styles.gap}>
        <span>{t("tour.demo.monthEnd")}</span>
        <b className={styles.in}>{format(612)}</b>
      </div>
    </div>
  );
}

export function StatsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  const parts = [
    { icon: "🛒", name: t("tour.demo.market"), amount: 312, share: 100 },
    { icon: "🏠", name: t("tour.demo.rent"), amount: 450, share: 100 },
    { icon: "☕", name: t("tour.demo.coffee"), amount: 64, share: 21 },
  ].sort((a, b) => b.amount - a.amount);
  const most = parts[0].amount;
  return (
    <div className={styles.preview}>
      {parts.map((part) => (
        <div key={part.name} className={styles.catBar}>
          <span className={styles.dayHead}>
            <span>
              {part.icon} {part.name}
            </span>
            <span>{format(part.amount)}</span>
          </span>
          <i style={{ width: `${(part.amount / most) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export function CalendarPreview() {
  const { t } = useTranslation();
  // A month of days, a few with something on them: red money out, green money in.
  const marks: Record<number, "out" | "in"> = { 3: "out", 10: "out", 12: "in", 15: "out", 25: "out", 30: "in" };
  return (
    <div className={styles.preview}>
      <div className={styles.calendar}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
          <span key={day} className={`${styles.calDay} ${day === 12 ? styles.calToday : ""}`}>
            {day}
            {marks[day] && <i className={marks[day] === "in" ? styles.calIn : styles.calOut} />}
          </span>
        ))}
      </div>
      <div className={styles.calLegend}>
        <span>
          <i className={styles.calOut} /> {t("tour.demo.calOut")}
        </span>
        <span>
          <i className={styles.calIn} /> {t("tour.demo.calIn")}
        </span>
      </div>
    </div>
  );
}

export function InvestmentsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <Line icon="📈" name={t("tour.demo.etf")} note={t("tour.demo.monthly")} amount={format(2480)} />
      <Line icon="🪙" name={t("tour.demo.crypto")} amount={format(310)} />
      <div className={styles.gap}>
        <span>{t("tour.demo.gain")}</span>
        <b className={styles.in}>+{format(214.6)}</b>
      </div>
    </div>
  );
}

export function DebtsPreview() {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  return (
    <div className={styles.preview}>
      <Line icon="🏦" name={t("tour.demo.carLoan")} note={t("tour.demo.loanRate")} amount={format(8730.85)} tone="late" />
      <Line icon="🙋" name={t("tour.demo.owesMe")} note={t("tour.demo.dueBy")} amount={format(300)} tone="in" />
      <div className={styles.gap}>
        <span>{t("tour.demo.netDebt")}</span>
        <b className={styles.late}>−{format(8430.85)}</b>
      </div>
    </div>
  );
}
