import { useMemo, useState } from "react";
import { celebrateSave, useSavedFlash } from "../../shared/feedback/saveFeedback";
import { Badge, Button, Col, Row, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toneChip } from "../../shared/utils/tone";
import { toast } from "react-toastify";
import type { TFunction } from "i18next";
import { ViewSwitch } from "../../shared/components/ViewSwitch";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegmentedBar } from "../../shared/components/SegmentedBar";
import { FiAlertCircle, FiAlertTriangle, FiBarChart2, FiCalendar, FiCheck, FiChevronRight, FiList, FiLock } from "react-icons/fi";
import type { Bill, BillPayment, BillWithStatus, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useCategories } from "../transactions/hooks/useTransactions";
import { useBills, useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useSettleOverdue, useUnmarkBillPaid, useUpdateBillPayment } from "./useBills";
import {
  arrears,
  billMonthStrip,
  billOverdue,
  billUrgency,
  cadenceTone,
  type CashCheckpoint,
  cashRunway,
  daysUntilDeadline,
  earliestDeadline,
  expectedAmount,
  getFrequencyLabel,
  groupBills,
  overdueBills,
  isInGracePeriod,
  monthForecast,
  outstandingTotal,
  paidThisPeriod,
  periodTotals,
  salaryShare,
  type MonthCell,
  supportsMonthStrip,
  totalsAreApproximate,
  URGENT_DAYS,
  yearlyBreakdown,
  currentPause,
  startsLater,
  yearAhead,
  type MonthChip,
  type MonthForecast,
  isStoppedNow,
  restingNow,
  getIntervalCount,
  monthlyEquivalent,
} from "./billsUtils";
import { billStartText } from "./billStartText";
import { categoryLabel } from "../../shared/utils/categories";
import { firestoreToDate, dateFormat, formatMonthName, daysBetween } from "../../shared/utils/dates";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonRows } from "../../shared/components/Skeletons";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import BillYearAhead from "./BillYearAhead";
import BillYearCost from "./BillYearCost";
import { BillManage } from "./BillManage";
import BillMonthTimeline from "./BillMonthTimeline";
import { monthTimeline } from "./monthTimeline";
import { useSalaryIncome } from "../incomes/useSalaryIncome";
import AddBillModal from "./AddBillModal";
import BillDetailModal from "./BillDetailModal";
import BillDeleteMessage from "./BillDeleteMessage";
import CategoryBillsModal from "./CategoryBillsModal";
import MarkPaidModal from "./MarkPaidModal";
import MonthBreakdownModal from "./MonthBreakdownModal";
import SettleOverdueModal from "./SettleOverdueModal";
import ActiveBillsModal from "./ActiveBillsModal";
import RunwaySheet from "./RunwaySheet";
import { dayTone, type DayToneInput } from "../calendar/dayTone";
import styles from "./css/BillsPage.module.css";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { PageShell } from "../../shared/components/PageShell";
import { ROW_PENDING, usePendingRecords } from "../../shared/hooks/usePendingRecords";
import { DensitySwitch } from "../../shared/components/DensitySwitch";
import { useDensity, type Density } from "../../shared/hooks/useDensity";
import { lineStatus, stripCards, type StripCard, type StripLine, type StripLineKind, type StripLineStatus, type StripSection } from "./billStrip";
import { billViewFrom, billViewFromOld, type BillView } from "./billViews";
import type { IconType } from "react-icons";
import { useToday } from "../../shared/hooks/useToday";

// ─── Cash runway — how much, by when ─────────────────────────────────────────

/**
 * The three nearest deadlines with a running total, so "what do I need in the
 * account, and by which day" is a figure you read rather than a sum you do.
 *
 * Deadlines, not due dates: an electricity bill three days past its due date
 * with three weeks of grace does not need the money today, and a subscription
 * due on the 15th absolutely does.
 */
function CashRunway({ checkpoints, formatCurrency, onOpen }: { checkpoints: CashCheckpoint[]; formatCurrency: (n: number) => string; onOpen: (index: number) => void }) {
  const { t, i18n } = useTranslation();

  const dateFmt = dateFormat("dayShort", i18n.resolvedLanguage ?? "en");

  if (checkpoints.length === 0) return null;

  return (
    <div className={styles.runway}>
      {checkpoints.map((checkpoint, index) => {
        // Colour tracks time pressure, not strictness — nearly every list has a
        // strict bill somewhere in it, so keying off that would paint all three
        // amber and say nothing. The lock icon carries strictness instead.
        const daysAway = daysBetween(new Date(), checkpoint.date);
        const color = checkpoint.overdue ? "var(--expense-text)" : daysAway <= URGENT_DAYS ? "var(--goal-text)" : "var(--color-text-primary)";

        return (
          // A button: which bills make the figure, and how much each, is one tap away.
          <button key={checkpoint.date.toISOString()} type="button" className={`${styles.runwayBox} ${styles.runwayBoxTappable}`} onClick={() => onOpen(index)}>
            <div className={styles.runwayDate}>{checkpoint.overdue ? t("bills.runwayNow") : t("bills.runwayBy", { date: dateFmt.format(checkpoint.date) })}</div>
            <div className={styles.runwayAmount} style={{ color }}>
              {formatCurrency(checkpoint.cumulative)}
            </div>
            <div className={styles.runwayNote}>
              {checkpoint.strictCount > 0 && <FiLock size={9} className="me-1" style={{ verticalAlign: "-1px", color: "var(--expense-text)" }} aria-hidden />}
              {t("bills.runwayBillCount", { count: checkpoint.cumulativeCount })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Period summary — the signature card ─────────────────────────────────────

function PeriodSummary({ breakdown, formatCurrency, onOpenBreakdown }: { breakdown: MonthForecast; formatCurrency: (n: number) => string; onOpenBreakdown: () => void }) {
  const { t, i18n } = useTranslation();
  const totals = useMemo(() => periodTotals(breakdown), [breakdown]);

  // The calendar month is the frame people think in, even for odd intervals.
  const periodEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }, []);
  const endLabel = dateFormat("dayShort", i18n.resolvedLanguage ?? "en").format(periodEnd);

  const settled = totals.due <= 0 && totals.totalCount > 0;
  const paidLine = t("bills.nOfMPaidLeft", { paid: totals.totalCount - totals.unpaidCount, total: totals.totalCount, left: formatCurrency(totals.due) });

  return (
    <div
      className={`${styles.periodCard} ${styles.forecastCardTappable} p-3 p-lg-4 mb-3`}
      role="button"
      tabIndex={0}
      onClick={onOpenBreakdown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenBreakdown();
        }
      }}
      title={t("bills.seeBreakdown")}
    >
      <div className="stat-head d-flex justify-content-between align-items-center gap-2">
        <span>
          {settled ? t("bills.allSettled") : t("bills.toPayThisPeriod")}
        </span>
        <Badge color="secondary" pill style={{ fontSize: "var(--fs-caption)", fontWeight: 500 }}>
          {t("bills.periodEnds", { date: endLabel })}
        </Badge>
      </div>

      <div className="d-flex align-items-baseline flex-wrap gap-2 mb-1">
        <span className={`${styles.bigAmount} ${settled ? styles.bigAmountSettled : ""}`}>{formatCurrency(settled ? totals.paid : totals.due)}</span>
        {!settled && totals.total > 0 && (
          <span className="text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
            {t("bills.ofTotal", { total: formatCurrency(totals.total) })}
          </span>
        )}
      </div>

      {totals.totalCount === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-small)" }}>
          {t("bills.noBillsHint")}
        </p>
      ) : (
        <>
          <p className="text-body-secondary mb-2" style={{ fontSize: "var(--fs-small)" }}>
            {settled ? t("bills.allSettledHint") : t("bills.alreadyPaid", { amount: formatCurrency(totals.paid) })}
          </p>

          {/* A piece per bill of the month, as wide as its amount: the paid ones
              filled, the rest outlined — which weigh most, and which are open. */}
          <SegmentedBar
            segments={breakdown.items.map((item) => ({ id: `${item.bill.id}|${item.periodKey}|${item.installmentIndex ?? 0}`, label: item.bill.name, amount: item.amount, done: item.isPaid }))}
            label={paidLine}
            describe={(segment) => t(segment.done ? "bills.segPaid" : "bills.segOpen", { name: segment.label, amount: formatCurrency(segment.amount) })}
          />

          <div className="mt-2 text-body-secondary" style={{ fontSize: "var(--fs-small)" }}>
            {paidLine}
          </div>

          <div className={styles.forecastHint}>
            {t("bills.seeBreakdown")}
            <FiChevronRight size={13} style={{ verticalAlign: "-2px" }} aria-hidden />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Next month ──────────────────────────────────────────────────────────────

/**
 * What next month is going to cost, as a sum you can check rather than a single
 * opaque figure: the bills whose amount is already known, plus the ones that
 * have to be estimated, equals roughly the total.
 *
 * Keeping the two halves apart is the point — €520 of rent and subscriptions is
 * a fact, €140 of electricity and water is a forecast, and a single "€660"
 * would present both with the same false confidence.
 */
function NextMonthCard({ forecast, formatCurrency, onOpenBreakdown }: { forecast: MonthForecast; formatCurrency: (n: number) => string; onOpenBreakdown: () => void }) {
  const { t, i18n } = useTranslation();

  // The month named on its own — "Μάρτιος", not the genitive "Μαρτίου".
  const monthLabel = formatMonthName(forecast.monthStart, i18n.resolvedLanguage ?? "en");

  return (
    <div
      className={`${styles.forecastCard} ${styles.forecastCardTappable} p-3 p-lg-4 mb-3`}
      role="button"
      tabIndex={0}
      onClick={onOpenBreakdown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenBreakdown();
        }
      }}
      title={t("bills.seeBreakdown")}
    >
      <div className="stat-head d-flex justify-content-between align-items-center gap-2">
        <span>{t("bills.nextMonthTitle")}</span>
        <Badge color="secondary" pill style={{ fontSize: "var(--fs-caption)", fontWeight: 500 }}>
          {monthLabel}
        </Badge>
      </div>

      <div className={styles.forecastLine}>
        <span className={styles.forecastLabel}>
          {t("bills.fixedTotal")}
          <span className={styles.forecastCount}>{t("bills.billCount", { count: forecast.fixedCount })}</span>
        </span>
        <span className={styles.forecastValue}>{formatCurrency(forecast.fixed)}</span>
      </div>

      <div className={styles.forecastLine}>
        <span className={styles.forecastLabel}>
          <span className={styles.forecastOp} aria-hidden>
            +
          </span>
          {t("bills.variableTotal")}
          <span className={styles.forecastCount}>{t("bills.billCount", { count: forecast.variableCount })}</span>
        </span>
        <span className={styles.forecastValue}>{formatCurrency(forecast.variable)}</span>
      </div>

      <div className={`${styles.forecastLine} ${styles.forecastTotalLine}`}>
        <span className={styles.forecastLabel}>{t("bills.approxTotal")}</span>
        <span className={styles.forecastTotal}>≈ {formatCurrency(forecast.total)}</span>
      </div>

      {/* Prepaying is what makes this figure move — say what came off it, or
          next month simply looks unaccountably cheap. */}
      {forecast.prepaid > 0 && <div className={styles.forecastNote}>⏩ {t("bills.prepaidNote", { amount: formatCurrency(forecast.prepaid), count: forecast.prepaidCount })}</div>}

      <div className={styles.forecastHint}>
        {t("bills.seeBreakdown")}
        <FiChevronRight size={13} style={{ verticalAlign: "-2px" }} aria-hidden />
      </div>
    </div>
  );
}

// ─── What the bills leave ────────────────────────────────────────────────────

/**
 * The monthly bills set against the pay they come out of.
 *
 * "€640 a month" answers nothing on its own. Beside the pay it is a decision:
 * a third of it gone before anything else is bought. The pay is the salary
 * the user typed on «Έσοδα» — what it brings in a month — rather than an
 * average of past income: a forecast belongs to the person making it.
 */
function WhatBillsLeave({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const [now] = useState(() => new Date());
  const { monthly: salary } = useSalaryIncome(now);

  // This month, not the twelve-month average. The pay arriving this month meets
  // the bills falling in this month; an average of a year is the wrong figure to
  // set against it, and in a month with a quarterly bill in it, badly wrong.
  const month = useMemo(() => monthForecast(bills, now, 0), [bills, now]);
  // What the month owes in full: still to pay, plus whatever has already gone.
  const monthlyBills = Math.round((month.total + month.prepaid) * 100) / 100;
  const approximate = month.variableCount > 0;
  // Short month with the year: Greek renders a lone long month in the genitive
  // ("Σεπτεμβρίου"), which reads as a fragment of a sentence rather than a label.
  const monthName = dateFormat("monthYearShort", i18n.resolvedLanguage ?? "en").format(month.monthStart);

  const share = salaryShare(salary, monthlyBills);

  if (!share) {
    return (
      <div className={`${styles.leaveBand} mb-4`}>
        <div className={styles.leaveSum}>{t("bills.setPayHint")}</div>
      </div>
    );
  }

  const overrun = share.left < 0;
  const owed = `${approximate ? "~" : ""}${formatCurrency(monthlyBills)}`;

  return (
    <div className={`${styles.leaveBand} mb-4`}>
      <div className="d-flex align-items-baseline justify-content-between gap-3 flex-wrap">
        <div>
          <div className={styles.statLabel} style={{ marginTop: 0 }}>
            {monthName}
          </div>
          <div className={styles.leaveSum} title={approximate ? t("bills.approximate") : undefined}>
            <strong>{formatCurrency(salary)}</strong> {t("bills.payLabel")} − <strong>{owed}</strong> {t("bills.billsLabel")}
          </div>
        </div>
        <div className={styles.leaveAmount} style={{ color: overrun ? "var(--color-expense-text)" : "var(--color-income-text)" }}>
          {formatCurrency(share.left)}
        </div>
      </div>

      <div className={styles.leaveBar} role="img" aria-label={t("bills.whatBillsLeave")}>
        <div className={styles.leaveBarBills} style={{ width: `${Math.min(share.takenPct, 100)}%` }} />
        <div className={styles.leaveBarLeft} style={{ width: `${share.leftPct}%` }} />
      </div>

      <div className={styles.leaveLegend}>
        <span>
          <span className={styles.leaveDot} style={{ background: "var(--expense)" }} />
          {t("bills.billsTakePct", { pct: Math.round(share.takenPct) })}
        </span>
        <span>
          {overrun ? (
            <span style={{ color: "var(--color-expense-text)", fontWeight: 600 }}>{t("bills.overrunsPay", { amount: formatCurrency(Math.abs(share.left)) })}</span>
          ) : (
            <>
              <span className={styles.leaveDot} style={{ background: "var(--income)" }} />
              {t("bills.leftPct", { pct: Math.round(share.leftPct) })}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Quick stats ─────────────────────────────────────────────────────────────

function QuickStats({
  bills,
  formatCurrency,
  onOpenActive,
  onOpenOverdue,
  onOpenNext,
}: {
  bills: BillWithStatus[];
  formatCurrency: (n: number) => string;
  onOpenActive: () => void;
  onOpenOverdue: () => void;
  /** What the next payment's day holds: every bill on it, and what they come to. */
  onOpenNext: () => void;
}) {
  const { t, i18n } = useTranslation();
  const active = bills.filter((b) => b.isActive);
  // Off right now — the holiday house this winter, the flat that was left. The
  // "N paused" line under the count existed before anything could be paused.
  const stopped = active.filter((b) => restingNow(b)).length;
  const grouped = groupBills(active);
  // The same list the tile opens, so the number and the names cannot disagree.
  const overdue = overdueBills(bills);
  const overdueCount = overdue.bills.length;
  const avgMonthly = active.reduce((s, b) => s + b.monthlyEquivalent, 0);
  const approximate = totalsAreApproximate(active);

  // Soonest unpaid bill, measured by when the money is actually needed — for a
  // bill behind on earlier periods, the oldest one it still owes.
  const nextBill = grouped.overdue[0] ?? grouped.upcoming.find((b) => b.deadline);
  const nextDays = nextBill ? daysUntilDeadline(nextBill) : undefined;
  const nextDeadline = nextBill ? earliestDeadline(nextBill) : undefined;

  const nextValue = nextDeadline ? dateFormat("dayShort", i18n.resolvedLanguage ?? "en").format(nextDeadline) : "—";
  const nextSub = nextBill ? nextBill.name : t("bills.allSettled");
  const nextColor = nextDays === undefined ? "var(--color-text-secondary)" : nextDays < 0 ? "var(--expense-text)" : nextDays <= 5 ? "var(--goal-text)" : "var(--color-text-primary)";

  const stats = [
    {
      value: String(overdueCount),
      label: t("bills.overdueCount"),
      color: overdueCount > 0 ? "var(--expense-text)" : "var(--color-text-primary)",
      sub: overdueCount > 0 ? formatCurrency(overdue.total) : t("bills.noneLate"),
      // "Three late" is a headline; which three is what you act on.
      onClick: overdueCount > 0 ? onOpenOverdue : undefined,
    },
    { value: nextValue, label: t("bills.nextUp"), color: nextColor, sub: nextSub, onClick: nextBill ? onOpenNext : undefined },
    {
      // A tilde, because neither figure is firm: variable bills carry an
      // estimate, and anything not billed monthly is an average spread over the
      // months rather than what actually leaves in one.
      value: `${approximate.monthly ? "~" : ""}${formatCurrency(avgMonthly)}`,
      label: t("bills.avgMonthly"),
      // The link blue, which is tuned per theme: Bootstrap's #0d6efd measures
      // 3.39:1 on the dark stat box.
      color: "var(--color-link)",
      sub: t("bills.perYearShort", { amount: `${approximate.yearly ? "~" : ""}${formatCurrency(avgMonthly * 12)}` }),
      title: approximate.monthly ? t("bills.approximate") : undefined,
    },
    {
      value: String(active.length - stopped),
      label: t("bills.totalActive"),
      color: "var(--color-invest-text)",
      sub: stopped + (bills.length - active.length) > 0 ? t("bills.pausedCount", { count: stopped + (bills.length - active.length) }) : t("bills.allRunning"),
      // The one stat with an obvious follow-up question: which ones?
      onClick: active.length > 0 ? onOpenActive : undefined,
    },
  ];

  return (
    <>
      <Row className="g-2 mb-2">
        {stats.map((s) => {
          const body = (
            <>
              <div className={styles.statValue} style={{ color: s.color }}>
                {s.value}
              </div>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statSub}>{s.sub}</div>
            </>
          );

          return (
            <Col xs={6} lg={3} key={s.label}>
              {s.onClick ? (
                <button type="button" className={`${styles.statBox} ${styles.statBoxTappable}`} title={s.title} onClick={s.onClick}>
                  {body}
                </button>
              ) : (
                <div className={styles.statBox} title={s.title}>
                  {body}
                </div>
              )}
            </Col>
          );
        })}
      </Row>
      <WhatBillsLeave bills={bills} formatCurrency={formatCurrency} />
    </>
  );
}

// ─── Due indicator ───────────────────────────────────────────────────────────

/**
 * One pill that answers "where does this stand?" — counted against the
 * deadline, so a bill sitting comfortably inside its grace window doesn't wear
 * the same red as one that has genuinely lapsed.
 */
function StatusChip({ bill, formatCurrency, now }: { bill: BillWithStatus; formatCurrency: (n: number) => string; now: Date }) {
  const { t, i18n } = useTranslation();
  const urgency = billUrgency(bill, now);

  // Anything overdue says so first, from whichever period it is: water with
  // July to September unpaid and October not due yet used to read a grey
  // "Unpaid", or "due in 5 days", as if the three before did not exist. One
  // payment late is how late it is; several are how many and what they come
  // to — the same figure the late tile adds up.
  const overdue = billOverdue(bill, now);
  if (overdue.count > 0) {
    return (
      <span className={styles.statusChip} style={toneChip("expense")}>
        {overdue.count > 1
          ? t("bills.chipOverdue", { count: overdue.count, amount: formatCurrency(overdue.total) })
          : t("bills.lateByDays", { count: Math.abs(daysUntilDeadline(bill, now) ?? 0) })}
      </span>
    );
  }

  // Not started yet: when it starts, rather than "due in 250 days".
  const starts = billStartText(bill, now, t, i18n.resolvedLanguage ?? "en");
  if (starts) {
    return <span className={`${styles.statusChip} ${styles.statusChipStart}`}>{starts}</span>;
  }

  // Measured in days, a paused bill reads "due in 170 days", which is true and
  // says nothing. What the reader needs is that it is off, and until when.
  const pause = currentPause(bill);
  if (!bill.isPaidThisPeriod && (pause?.state === "paused" || pause?.state === "ended")) {
    const month = dateFormat("monthYearShort", i18n.resolvedLanguage ?? "en");
    return pause.state === "paused" ? (
      <span className={styles.statusChip} style={toneChip("goal")}>
        {t("bills.chipPausedUntil", { month: month.format(pause.to!) })}
      </span>
    ) : (
      <span className={`${styles.statusChip} text-body-secondary`} style={{ background: "var(--color-background-secondary)" }}>
        {t("bills.chipStopped", { month: month.format(pause.from) })}
      </span>
    );
  }

  if (urgency === "paid") {
    // The tick and how much, so a paid bill can be read without opening it.
    // Every instalment of the period added up; a period covered by a payment
    // made ahead has none of its own, and says paid instead.
    const paid = paidThisPeriod(bill);
    return (
      <span
        className={styles.statusChip}
        style={toneChip("income")}
        title={paid > 0 ? t("bills.chipPaidAmount", { amount: formatCurrency(paid) }) : undefined}
      >
        ✓ {paid > 0 ? formatCurrency(paid) : t("bills.paidRecently")}
      </span>
    );
  }

  // Nothing overdue, so this is this period's own deadline, still ahead.
  const days = daysUntilDeadline(bill, now);
  if (days === undefined) {
    return (
      <span className={styles.statusChip} style={toneChip("pending")}>
        {t("bills.unpaid")}
      </span>
    );
  }

  const label = days === 0 ? t("bills.dueToday") : t("bills.dueInDays", { count: days });

  return (
    // Soon in amber, later in the neutral chip — each a role pair (≥ 8:1); a
    // 15% mix with the bare colour as lettering measured around 4:1.
    <span className={styles.statusChip} style={urgency === "soon" ? toneChip("goal") : urgency === "late" ? toneChip("expense") : { background: "var(--neutral-soft)", color: "var(--on-neutral-soft)" }}>
      {label}
    </span>
  );
}

/**
 * The date cell: for anything unpaid, the actual last day the money must be
 * there. For a settled bill, when it comes round again. Returned as a
 * label/value pair so it can sit in the card's figure row rather than trailing
 * the status chip as an afterthought.
 */
function deadlineFact(bill: BillWithStatus, t: TFunction, dateFmt: Intl.DateTimeFormat, now: Date): { label: string; value: string; color?: string } {
  // Behind on anything, the date that matters is the one the oldest of it was
  // owed by — gone, so in red. "Pay by 30 Oct" beside three unpaid months says
  // there is time when there is not.
  const overdue = billOverdue(bill, now);
  if (overdue.count > 0 && overdue.oldestDeadline) return { label: t("bills.labelPayBy"), value: dateFmt.format(overdue.oldestDeadline), color: "var(--expense-text)" };

  // With its year: a first payment months away, read as "30 Jun", looks like the June just gone.
  if (!bill.isPaidThisPeriod && startsLater(bill, now)) return { label: t("bills.labelNextDue"), value: bill.nextDueDate ? dateFormat("day", dateFmt.resolvedOptions().locale).format(bill.nextDueDate) : "—" };
  const pause = currentPause(bill);
  if (!bill.isPaidThisPeriod && pause?.state === "ended") return { label: t("bills.labelStopped"), value: dateFmt.format(pause.from) };
  if (!bill.isPaidThisPeriod && pause?.state === "paused") return { label: t("bills.labelResumes"), value: bill.nextDueDate ? dateFmt.format(bill.nextDueDate) : "—" };
  if (bill.isPaidThisPeriod) {
    return { label: t("bills.labelNextDue"), value: bill.nextDueDate ? dateFmt.format(bill.nextDueDate) : "—" };
  }
  if (!bill.deadline) return { label: t("bills.labelPayBy"), value: "—" };

  // Inside the grace window the two dates differ, and the later one is the one
  // that matters — say so explicitly rather than showing a date that has passed.
  // Nothing is overdue by now, so this deadline is still ahead.
  const grace = isInGracePeriod(bill, now);
  return {
    label: grace ? t("bills.labelGraceUntil") : t("bills.labelPayBy"),
    value: dateFmt.format(bill.deadline),
  };
}

// ─── Bill row ────────────────────────────────────────────────────────────────
// Information first: what was paid, when, what it usually costs, and what it
// works out to per month. Every action — pay, edit, delete — lives one tap away
// in the detail modal; the row itself is the only affordance, with a trailing
// chevron as a purely visual hint. No row-level menu of any kind: that was a
// Popper-positioned popover, and popovers can end up clipped or mispositioned
// in ways a plain centered Modal simply can't.
//
// One markup, two layouts. On a phone the columns stack into four generously
// spaced lines — this is the screen the list is actually read on, so it gets
// the room; from `md` up the same cells snap into a denser table instead.

/** How often it comes, as a coloured badge — the same colour for the same cadence everywhere. */
function CadenceBadge({ bill }: { bill: BillWithStatus }) {
  const { t } = useTranslation();
  const freq = getFrequencyLabel(bill);
  const tone = cadenceTone(bill);
  return (
    <Badge pill color={`${tone}-subtle`} className={`text-${tone}-emphasis border border-${tone}-subtle ${styles.cadenceBadge}`}>
      {t(freq.key, { count: freq.count })}
    </Badge>
  );
}

/** "Usually €80–122" — what the amount is like; how often lives in the badge. */
function BillSubtitle({ bill, formatCurrency }: { bill: BillWithStatus; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const range = bill.paidAmountRange;

  let amountNote: string;
  if (!bill.isVariableAmount) {
    amountNote = t("bills.fixedAmount");
  } else if (!range) {
    amountNote = t("bills.variesNoHistory");
  } else if (range.min === range.max) {
    amountNote = t("bills.usuallyOne", { amount: formatCurrency(range.min) });
  } else {
    amountNote = t("bills.usuallyRange", { min: formatCurrency(range.min), max: formatCurrency(range.max) });
  }

  return (
    <span className={styles.cardSubtitle}>
      {amountNote}
      {/* A part-paid year owes money now, which nothing else on the row says:
          the amount column shows one instalment and the strip shows the months
          as covered. */}
      {bill.installmentTotal > 1 && bill.installmentsPaid > 0 && !bill.isPaidThisPeriod && (
        <span className={styles.installmentNote}>
          {t("bills.installmentProgress", {
            paid: bill.installmentsPaid,
            count: bill.installmentTotal,
            amount: formatCurrency(bill.outstandingAmount),
          })}
        </span>
      )}
    </span>
  );
}

// ─── Month strip ─────────────────────────────────────────────────────────────
// A run of calendar months per bill, coloured in where a payment covers them. A
// bill every 2 months paints two months solid per payment, so the cadence is
// something you see rather than something the subtitle states.

/* The calendars' shared colours (`dayTone`), as on the bill's year grid: red
   to pay, the amber dot when late, pale red struck through once paid, a dashed
   red edge for the months still to come and a dashed grey one for a month off. */
const chipLook = (status: MonthChip["status"]): DayToneInput =>
  status === "paid" ? { out: "done" } : status === "late" ? { out: "todo", late: true } : status === "due" ? { out: "todo" } : status === "future" ? { out: "ahead" } : status === "paused" ? { off: true } : {};

function MonthStrip({ bill, now }: { bill: BillWithStatus; now: Date }) {
  const { t, i18n } = useTranslation();
  const monthFmt = dateFormat("monthShort", i18n.resolvedLanguage ?? "en");
  const chips = useMemo(() => billMonthStrip(bill, now), [bill, now]);

  const labelFor = (status: MonthChip["status"]) =>
    status === "paid" ? t("bills.monthPaid") : status === "paused" ? t("bills.monthPaused") : status === "late" ? t("bills.monthState_overdue") : status === "due" ? t("bills.monthDue") : status === "future" ? t("bills.monthFuture") : t("bills.monthEmpty");

  return (
    <div className={styles.monthStrip} onClick={(e) => e.stopPropagation()}>
      {chips.map((chip) => (
        <div
          key={chip.key}
          className={`${styles.monthChip} ${dayTone(chipLook(chip.status))} ${chip.status === "paused" ? styles.monthChipPaused : ""}`}
          title={`${monthFmt.format(chip.start)} — ${labelFor(chip.status)}`}
        >
          {monthFmt.format(chip.start)}
        </div>
      ))}
    </div>
  );
}

// ─── Bill figures ────────────────────────────────────────────────────────────
// The three figures worth comparing on a bill, on the list's «Αναλυτικό» rows.

/** One labelled figure in the card's stat row. */
function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue} style={color ? { color } : undefined}>
        {value}
      </span>
      <span className={styles.metricSub}>{sub ?? " "}</span>
    </div>
  );
}

/** «Ανενεργό» — the same words beside a switched-off bill's name in every view. */
function OffTag() {
  const { t } = useTranslation();
  return <span className={styles.offTag}>{t("bills.offTag")}</span>;
}

// ─── The bills list: one card per bill ──────────────────────────────────────
// The card's head is the icon, the bill's name and its figure — the same at every
// density; inside, one line per date,
// each led by its day in a small pocket-calendar block (red when late) and what
// that date is — a late bill lists every unpaid period, so none hides (owner,
// 2026-11-17). More of it with the density switch:
//   Απλό      — the head and the dated lines;
//   Κανονικό  — + a foot band: status, cadence, the usual range, and the days on
//               either side of today as two date blocks («Προηγούμενος» · «Επόμενος»);
//   Αναλυτικό — + in that band: the three figures (last · each time · next) and the six months.
// The card is the only affordance: a tap opens the bill, where it is paid,
// changed or deleted. Which dates and which figures: `billStrip.ts`.

const STRIP_LINE_KEYS: Record<StripLineKind, string> = {
  unpaid: "bills.stripUnpaid",
  paid: "bills.stripPaid",
  next: "bills.stripNext",
  starts: "bills.stripStarts",
  stopped: "bills.stripStopped",
  resumes: "bills.stripResumes",
  lastPaid: "bills.stripLastPaidOn",
};

/** The line's status icon — the chips' meanings and tones, never colour alone (each has its label). */
const STRIP_STATUS_ICONS: Record<StripLineStatus, { label: string; tone: string }> = {
  paid: { label: "bills.stripPaid", tone: styles.stripIconPaid },
  due: { label: "bills.stripInTime", tone: styles.stripIconDue },
  late: { label: "bills.stripLate", tone: styles.stripIconLate },
};

/** One dated line: the day block, what it is and its figure, and its status icon. */
function StripLineRow({ line, formatCurrency, locale }: { line: StripLine; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  const status = lineStatus(line);
  return (
    <div className={styles.stripRow}>
      <span className={`${styles.stripDay} ${line.late ? styles.stripDayLate : ""}`} title={line.date ? dateFormat("dayLong", locale).format(line.date) : undefined}>
        <span className={styles.stripDayNum}>{line.date ? dateFormat("dayNumber", locale).format(line.date) : "—"}</span>
        {line.date && <span className={styles.stripDayMonth}>{dateFormat("monthShort", locale).format(line.date)}</span>}
      </span>
      <span className={`${styles.stripLineText} ${line.late ? styles.stripLineLate : ""}`}>
        {line.date ? t(STRIP_LINE_KEYS[line.kind]) : t("bills.stripNoDate")}
        {line.amount !== undefined && (
          <span className={styles.stripLineAmount}>
            {" · "}
            {line.approx ? "~" : ""}
            {formatCurrency(line.amount)}
          </span>
        )}
      </span>
      {status && (
        <span className={`${styles.stripIcon} ${STRIP_STATUS_ICONS[status].tone}`} role="img" aria-label={t(STRIP_STATUS_ICONS[status].label)} title={t(STRIP_STATUS_ICONS[status].label)} data-status={status}>
          {status === "paid" ? <FiCheck aria-hidden /> : status === "late" ? <FiAlertTriangle aria-hidden /> : <FiAlertCircle aria-hidden />}
        </span>
      )}
    </div>
  );
}

/**
 * One block of the «Κανονικό» foot: a word, the square date block the dated
 * lines already use, and the figure under the word (owner, 2026-11-19 — a
 * calendar square, never a coloured dot).
 *
 * A bill with no such day keeps its word and shows «—» in a plain dashed block,
 * never an empty box, and never the green of a payment that did not happen.
 */
function BillFootDay({
  word,
  date,
  amount,
  approx,
  tone,
  note,
  locale,
  formatCurrency,
}: {
  word: string;
  date?: Date;
  amount?: number;
  /** A variable bill's estimate, printed with «~». */
  approx?: boolean;
  /** The block's look while there IS a day: paid green behind, dashed ahead. */
  tone: string;
  /** What stands in for the figure when there is no day. */
  note: string;
  locale: string;
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className={styles.footBlock}>
      <span className={`${styles.stripDay} ${date ? tone : styles.footDayNone}`} title={date ? dateFormat("dayLong", locale).format(date) : undefined}>
        <span className={styles.stripDayNum}>{date ? dateFormat("dayNumber", locale).format(date) : "—"}</span>
        {date && <span className={styles.stripDayMonth}>{dateFormat("monthShort", locale).format(date)}</span>}
      </span>
      <span className={styles.footText}>
        <span className={styles.footWord}>{word}</span>
        <span className={styles.footFigure}>{date && amount !== undefined ? `${approx ? "~" : ""}${formatCurrency(amount)}` : note}</span>
      </span>
    </div>
  );
}

function BillStripCard({
  card,
  paid,
  density,
  formatCurrency,
  icon,
  onOpenDetails,
  now,
  flash,
  busy,
}: {
  card: StripCard;
  /** In «Πληρωμένα»: the card on a soft green ground. */
  paid: boolean;
  density: Density;
  formatCurrency: (n: number) => string;
  /** The category's icon, in the head at every density. */
  icon?: string;
  onOpenDetails: (b: BillWithStatus) => void;
  now: Date;
  flash: string;
  /** A write on its way: faded, opens nothing until it lands. */
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const { bill } = card;
  const dateFmt = dateFormat("dayShort", locale);
  const lastPaid = bill.payments[0]?.amount;
  const open = () => {
    if (!busy) onOpenDetails(bill);
  };
  const variable = bill.isVariableAmount && bill.paidAmountRange;

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className={`${styles.stripCard} ${paid ? styles.stripCardPaid : ""} ${!bill.isActive ? styles.billOff : ""} ${busy ? ROW_PENDING : ""} ${flash}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className={styles.stripCardHead}>
        <span className={styles.stripName}>
          {icon && <span aria-hidden>{icon} </span>}
          {bill.name}
          {!bill.isActive && <OffTag />}
        </span>
        <span className={`${styles.stripAmount} ${card.late ? styles.stripAmountLate : ""}`}>
          {card.approx ? "~" : ""}
          {formatCurrency(card.amount)}
        </span>
      </div>

      <div className={styles.stripRows}>
        {card.lines.map((line, i) => (
          <StripLineRow key={line.date?.getTime() ?? i} line={line} formatCurrency={formatCurrency} locale={locale} />
        ))}
      </div>

      {density !== "simple" && (
        <div className={styles.stripMain}>
          {/* Status first, then cadence, from the left edge, as on every list of bills. */}
          <span className={styles.stripTags}>
            <StatusChip bill={bill} formatCurrency={formatCurrency} now={now} />
            <CadenceBadge bill={bill} />
            {variable && <BillSubtitle bill={bill} formatCurrency={formatCurrency} />}
            {bill.paidAheadCount > 0 && <span className={styles.aheadChip}>⏩ {t("bills.paidAheadShort", { count: bill.paidAheadCount })}</span>}
          </span>
          {/* The days on either side of today, as two small date blocks: the
              payment before this one and the one coming (owner, 2026-11-19).
              The card's HEAD never changes with the density — this is the foot
              (`.claude/rules/ui.md` 10). «Αναλυτικό» says the same in its three
              figures, so it keeps those instead. */}
          {density === "normal" && (
            <div className={styles.stripFoot}>
              <BillFootDay
                word={t("bills.stripPrevious")}
                date={bill.lastPaidDate}
                amount={lastPaid}
                tone={styles.footDayPrev}
                note={t("bills.neverPaid")}
                locale={locale}
                formatCurrency={formatCurrency}
              />
              <BillFootDay
                word={t("bills.stripNext")}
                date={bill.nextDueDate}
                amount={expectedAmount(bill)}
                approx={bill.isVariableAmount}
                tone={styles.footDayNext}
                note={t("bills.stripNoDate")}
                locale={locale}
                formatCurrency={formatCurrency}
              />
            </div>
          )}
          {density === "detailed" && (
            <div className={styles.stripMore}>
              <div className={styles.cardMetrics}>
                <Metric label={t("bills.colLastPaid")} value={lastPaid !== undefined ? formatCurrency(lastPaid) : "—"} sub={bill.lastPaidDate ? dateFmt.format(bill.lastPaidDate) : t("bills.neverPaid")} />
                <Metric
                  label={t("bills.colEachTime")}
                  value={`${bill.isVariableAmount ? "~" : ""}${formatCurrency(expectedAmount(bill))}`}
                  sub={
                    bill.frequency === "monthly" && getIntervalCount(bill) === 1
                      ? t("bills.perMonthShort")
                      : t("bills.monthlyShare", { amount: formatCurrency(monthlyEquivalent(bill, expectedAmount(bill))) })
                  }
                />
                {(() => {
                  const fact = deadlineFact(bill, t, dateFmt, now);
                  return <Metric label={fact.label} value={fact.value} color={fact.color} />;
                })()}
              </div>
              {/* Weekly is the one cadence a strip of calendar months can't draw. */}
              {supportsMonthStrip(bill) && <MonthStrip bill={bill} now={now} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One section of the list: a card per bill, earliest date first, two side by side where there is room. */
function BillStrip({
  bills,
  section,
  density,
  formatCurrency,
  categoryFor,
  onOpenDetails,
  now,
  flash,
}: {
  bills: BillWithStatus[];
  section: StripSection;
  density: Density;
  formatCurrency: (n: number) => string;
  categoryFor: (id: string) => Category | undefined;
  onOpenDetails: (b: BillWithStatus) => void;
  now: Date;
  flash: (id: string) => string;
}) {
  const { busy } = usePendingRecords();
  const cards = useMemo(() => stripCards(bills, section, now), [bills, section, now]);

  return (
    <div className={styles.stripCards}>
      {cards.map((card) => (
        <BillStripCard
          key={card.bill.id}
          card={card}
          paid={section === "settled" && !card.late}
          density={density}
          formatCurrency={formatCurrency}
          icon={categoryFor(card.bill.categoryId)?.icon}
          onOpenDetails={onOpenDetails}
          now={now}
          flash={flash(card.bill.id)}
          busy={busy("bills", card.bill.id)}
        />
      ))}
    </div>
  );
}

/** The three views (`billViews.ts`): the list, this month, the year. */
const VIEW_BUTTONS: { id: BillView; icon: IconType; label: string }[] = [
  { id: "list", icon: FiList, label: "bills.viewList" },
  { id: "month", icon: FiCalendar, label: "bills.viewTimeline" },
  { id: "year", icon: FiBarChart2, label: "bills.viewYear" },
];

/** «Λίστα · Ο μήνας · Η χρονιά» — the same bills, three ways. */
function BillViewToggle({ view, onChange }: { view: BillView; onChange: (view: BillView) => void }) {
  const { t } = useTranslation();

  return (
    <ViewSwitch
      label={t("bills.viewLabel")}
      value={view}
      onChange={onChange}
      stackOnPhone
      options={VIEW_BUTTONS.map(({ id, icon, label }) => ({ id, icon, label: t(label) }))}
    />
  );
}

/**
 * The three pages of «Πάγια».
 *
 *   overview — to read: what is due, next month, the runway, the year. The «+» adds a bill here too.
 *   pay      — to act: the bills themselves, with what is late first.
 *   manage   — every bill by name, no figures: to change one or delete it.
 *   all      — the page as it was, both together.
 *
 * The page was one long column of figures and buttons; split, each answers one
 * question — "where do I stand" or "what do I pay now".
 */
export type BillsPageView = "overview" | "pay" | "manage" | "all";


/** A value kept on the device, or undefined — a private window or a broken entry reads as nothing. */
function readStored(key: string): unknown {
  try {
    const item = localStorage.getItem(key);
    return item === null ? undefined : JSON.parse(item);
  } catch {
    return undefined;
  }
}

// ─── Yearly projection ───────────────────────────────────────────────────────

function YearlyProjection({
  bills,
  categoryFor,
  formatCurrency,
  onOpenCategory,
}: {
  bills: BillWithStatus[];
  categoryFor: (id: string) => Category | undefined;
  formatCurrency: (n: number) => string;
  onOpenCategory: (categoryId: string, label: string) => void;
}) {
  const { t } = useTranslation();

  const { total, categories } = useMemo(
    () => yearlyBreakdown(bills, (id) => categoryLabel(categoryFor(id)?.name, t) || "—"),
    [bills, categoryFor, t],
  );
  const approximate = useMemo(() => totalsAreApproximate(bills.filter((b) => b.isActive)), [bills]);

  return (
    <div className={`${styles.yearlyCard} p-3 p-lg-4`}>
      <div className="mb-3">
        <div className="stat-head">{t("bills.yearlyProjection")}</div>
        <div className={styles.yearlyMuted}>{t("bills.yearlyProjectionHint")}</div>
      </div>

      {categories.length === 0 ? (
        <p className={`${styles.yearlyMuted} mb-0`}>{t("bills.noBillsToProject")}</p>
      ) : (
        <>
          {/* Yearly headline, with the monthly equivalent below it — the two
              figures people actually budget against. */}
          <div className="d-flex align-items-baseline justify-content-between gap-2">
            <span className={styles.yearlyMuted}>{t("bills.perYear")}</span>
            <span className={styles.yearlyAmount} title={approximate.yearly ? t("bills.approximate") : undefined}>
              {approximate.yearly ? "~" : ""}
              {formatCurrency(total)}
            </span>
          </div>

          <hr className={styles.yearlyDivider} />

          <div className="d-flex align-items-baseline justify-content-between gap-2 mb-3">
            <span className={styles.yearlyMuted}>{t("bills.monthlyEquivalentLabel")}</span>
            <span className={`${styles.yearlyMonthly} fw-semibold`} title={approximate.monthly ? t("bills.approximate") : undefined}>
              {approximate.monthly ? "~" : ""}
              {formatCurrency(total / 12)}
              <span className="fw-normal ms-1" style={{ fontSize: "var(--fs-caption)" }}>
                {t("bills.perMonthShort")}
              </span>
            </span>
          </div>

          <hr className={styles.yearlyDivider} />

          <div className={`${styles.yearlyKicker} text-uppercase mb-2`}>{t("bills.byCategory")}</div>
          <div className={`${styles.yearlyHint} mb-2`}>{t("bills.tapCategoryHint")}</div>

          <div className="d-flex flex-column gap-2">
            {categories.map((c) => (
              <button key={c.categoryId} type="button" className={styles.yearlyCategory} onClick={() => onOpenCategory(c.categoryId, c.label)}>
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1" style={{ fontSize: "var(--fs-small)" }}>
                  <span className="text-break d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
                    <span aria-hidden>{categoryFor(c.categoryId)?.icon ?? "•"}</span>
                    {c.label}
                  </span>
                  <span className="flex-shrink-0 text-end tabular-nums">
                    {formatCurrency(c.yearlyAmount)} <span className="fw-semibold">{Math.round(c.percentage)}%</span>
                    <span className="d-block" style={{ fontSize: "var(--fs-caption)" }}>
                      {formatCurrency(c.yearlyAmount / 12)} {t("bills.perMonthShort")}
                    </span>
                  </span>
                </div>
                <div className={styles.yearlyTrack}>
                  <div className={styles.yearlyFill} style={{ width: `${c.percentage}%` }} />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BillsPage({ view = "all" }: { view?: BillsPageView }) {
  const { t, i18n } = useTranslation();
  // What each page shows: the figures, the list, or both.
  const showFigures = view === "overview" || view === "all";
  const showList = view === "pay" || view === "all";
  const billsQuery = useBills();
  const { data: bills = [] } = billsQuery;
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  // A failed read used to leave this page blank under its tabs.
  const load = usePageLoad(noAnswerYet(billsQuery));
  // The bill just added, edited or paid lights once its dialog has gone.
  const billFlash = useSavedFlash("bills", useMemo(() => bills.map((b) => b.id), [bills]));
  const { data: categories = [] } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();

  const createBill = useCreateBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  // Deleting waits for a connection; everything else on this page is queued.
  const deleteGuard = useOfflineGuard("delete");
  const markPaid = useMarkBillPaid();
  const unmarkPaid = useUnmarkBillPaid();
  const updatePayment = useUpdateBillPayment();
  const settleOverdue = useSettleOverdue();

  const [showModal, setShowModal] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillWithStatus | null>(null);
  const [detailBill, setDetailBill] = useState<BillWithStatus | null>(null);

  const [openCategory, setOpenCategory] = useState<{ id: string; label: string } | null>(null);
  const [payingBill, setPayingBill] = useState<BillWithStatus | null>(null);
  // The month chosen from the year grid, if the form was opened that way.
  const [payingPeriod, setPayingPeriod] = useState<string | undefined>();
  // And which instalment of it, for a bill paid in parts.
  const [payingInstallment, setPayingInstallment] = useState<number | undefined>();
  // The bill whose overdue periods are being marked paid without a transaction.
  const [settlingBill, setSettlingBill] = useState<BillWithStatus | null>(null);
  // Which month's breakdown is open, if any.
  // An offset in months from today: 0 is this one, 1 the next, and the year
  // view can ask for any of the twelve.
  const [breakdownMonth, setBreakdownMonth] = useState<number | null>(null);
  const [showActive, setShowActive] = useState(false);
  // One of the "now / by …" figures opened, or the next payment's day: the
  // first checkpoints through the one tapped.
  const [runwayOpen, setRunwayOpen] = useState<{ upTo: number; title: string } | null>(null);
  const [showOverdue, setShowOverdue] = useState(false);
  // «Αναίρεση πληρωμής», waiting for its «Ναι».
  const [undoTarget, setUndoTarget] = useState<{ bill: BillWithStatus; payment: BillPayment } | null>(null);
  // Below the desktop breakpoint the year sat under the whole list, which meant
  // scrolling past every bill to reach it. Two views, one at a time.
  const compact = useNarrowScreen("(max-width: 991.98px)");
  const [mobileView, setMobileView] = useState<"bills" | "year">("bills");
  // One clock reading for every card, so the month strips line up on the same
  // window — the app's shared day (`useToday`), the one the menu's badge counts
  // from, so a page left open overnight moves to today with it.
  const now = useToday();

  const categoryFor = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return (id: string) => map.get(id);
  }, [categories]);

  // Computed once for both the card and the breakdown it opens, so the modal
  // can never disagree with the figure that was tapped to reach it.
  const forecast = useMemo(() => monthForecast(bills), [bills]);
  // The single source for both the summary card and the modal it opens, so the
  // two can never contradict each other.
  const thisMonth = useMemo(() => monthForecast(bills, now, 0), [bills, now]);
  const owed = useMemo(() => arrears(bills), [bills]);

  /**
   * Split into what still wants money and what doesn't, each ordered by when
   * the money is needed.
   *
   * One flat list distinguished paid from unpaid only by a colour bar and a
   * faded background — enough to notice once you knew to look for it, not
   * enough to answer "what's left?" at a glance. A heading with a running
   * total answers it before you read a single row.
   */
  // Per device, not per account: how you like to read a list is not a fact
  // about your money, and putting it on the account would cost a read.
  // Seven views became three (2026-11-17): a choice kept under the old key is
  // read as the view that took it in (`billViewFromOld`), once, until a new one is picked.
  const [storedBillView, setBillView] = useLocalStorage<unknown>("bills-view-2", null);
  const billView: BillView = useMemo(() => (storedBillView === null ? billViewFromOld(readStored("bills-view")) : billViewFrom(storedBillView)), [storedBillView]);

  // How much each row of the list says — «Απλό · Κανονικό · Αναλυτικό», per device.
  const [density, setDensity] = useDensity("bills");
  const listShown = showList && billView === "list";

  const monthsAhead = useMemo(() => yearAhead(bills, now), [bills, now]);

  // The same pay day the planner works from — the salary on «Έσοδα» — since
  // a second guess here would be a second answer to "when do I get paid".
  const { thisMonth: pay } = useSalaryIncome(now);
  const timeline = useMemo(() => monthTimeline(bills, now, pay ? { ...pay, label: t("bills.timelineIncome") } : undefined), [bills, now, pay, t]);
  const monthTitleFmt = dateFormat("monthYear", i18n.resolvedLanguage ?? "en");

  const sections = useMemo(() => {
    // Each bill's days worked out once — they walk its arrears — and counted
    // from the oldest payment it owes, so four periods behind sorts above one.
    const days = new Map(bills.map((b) => [b, daysUntilDeadline(b, now) ?? Number.MAX_SAFE_INTEGER]));
    const byDeadline = (a: BillWithStatus, b: BillWithStatus) => days.get(a)! - days.get(b)!;
    // Anything still owed is still to pay — including a bill paid for this
    // period that is behind on an earlier one. Listing that under "Paid"
    // buried exactly the bill the owner was looking for.
    const owes = (b: BillWithStatus) => !b.isPaidThisPeriod || billOverdue(b, now).count > 0;
    // Switched off: nothing to pay, so not among what is — listed last, by name.
    const running = bills.filter((b) => b.isActive);
    const inactive = bills.filter((b) => !b.isActive).sort((a, b) => a.name.localeCompare(b.name));
    // Off this period — paused, stopped, or not begun — and owing nothing from
    // before: at the foot of the list, greyed, under a heading that says why.
    // Among the bills still to pay, «Ρεύμα Έδεσσα» stopped since November wore
    // the same colours as one due tomorrow and only a chip to tell them apart.
    // One that is behind on months before its pause stays up top: it owes.
    const resting = (b: BillWithStatus) => restingNow(b, now);
    const notYet = running.filter((b) => resting(b) && !!startsLater(b, now)).sort((a, b) => (startsLater(a, now)?.getTime() ?? 0) - (startsLater(b, now)?.getTime() ?? 0) || a.name.localeCompare(b.name));
    const stopped = running.filter((b) => resting(b) && !startsLater(b, now)).sort((a, b) => a.name.localeCompare(b.name));
    const current = running.filter((b) => !resting(b));
    const outstanding = current.filter(owes).sort(byDeadline);
    // Most recently settled first — the useful order for a section you scan
    // only to confirm something went through.
    const settled = current.filter((b) => !owes(b)).sort((a, b) => (b.lastPaidDate?.getTime() ?? 0) - (a.lastPaidDate?.getTime() ?? 0));

    // What is left on each period, not its price: a part-paid gym owes the parts
    // still to come, a paused or stopped bill owes nothing, and one switched off
    // is not counted. And every part paid, not only the latest, on the other side.
    //
    // The current periods only — `outstandingTotal` leaves earlier ones to the
    // late tile, so a bill paid this period adds nothing here however far
    // behind it is, and a late current period is never counted twice.
    return [
      { key: "outstanding", title: t("bills.sectionOutstanding"), bills: outstanding, total: outstandingTotal(outstanding), tone: "var(--expense-text)" },
      { key: "settled", title: t("bills.sectionSettled"), bills: settled, total: settled.reduce((s, b) => s + paidThisPeriod(b), 0), tone: "var(--income-text)" },
      // No totals: nothing is owed on them this period, and a figure would say there was.
      { key: "later", title: t("bills.sectionLater"), bills: notYet, note: t("bills.sectionLaterNote"), tone: "var(--text-2)" },
      { key: "stopped", title: t("bills.sectionStopped"), bills: stopped, note: t("bills.sectionStoppedNote"), tone: "var(--text-2)" },
      { key: "inactive", title: t("bills.sectionInactive"), bills: inactive, note: t("bills.sectionInactiveNote"), tone: "var(--text-2)" },
    ].filter((section) => section.bills.length > 0) as { key: StripSection; title: string; bills: BillWithStatus[]; total?: number; note?: string; tone: string }[];
  }, [bills, t, now]);

  // Keep an open detail modal in sync after a payment lands or is undone.
  const liveDetailBill = detailBill ? (bills.find((b) => b.id === detailBill.id) ?? null) : null;
  const runway = useMemo(() => cashRunway(bills), [bills]);
  const runwayDateFmt = dateFormat("dayShort", i18n.resolvedLanguage ?? "en");
  // The dearest first, and the ones resting this period (paused, stopped, not begun) after all the rest.
  const activeBills = useMemo(
    () => bills.filter((b) => b.isActive).sort((a, b) => Number(isStoppedNow(a, now)) - Number(isStoppedNow(b, now)) || b.monthlyEquivalent - a.monthlyEquivalent),
    [bills, now],
  );
  const late = useMemo(() => overdueBills(bills), [bills]);
  const shortDateFmt = dateFormat("dayShort", i18n.resolvedLanguage ?? "en");
  const categoryBills = useMemo(
    () => (openCategory ? bills.filter((b) => b.isActive && b.categoryId === openCategory.id).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent) : []),
    [bills, openCategory],
  );

  // Both of these close their dialog straight away rather than on the server's
  // answer. The cache has already been updated optimistically, so the screen is
  // correct the moment it closes; a write that then fails rolls itself back and
  // says so, which beats holding the whole page hostage to the network.
  const handleConfirmPaid = (amountInBase: number, paidDate: Date, periodKey: string, installmentIndex?: number, accountId?: string) => {
    if (!payingBill) return;
    void saveWithoutWaiting(markPaid, { bill: payingBill, paidDate, paidAmount: amountInBase, periodKey, installmentIndex, accountId }, () => toast.error(t("bills.markPaidFailed")), [["bills", payingBill.id]]);
    celebrateSave({ collection: "bills", id: payingBill.id });
    setPayingBill(null);
  };

  const handleUndoPayment = (bill: BillWithStatus) => {
    // The most recent instalment, not "the payment": undoing a part-paid year
    // has to take back the last part rather than an arbitrary one.
    const latest = bill.payments.filter((p) => p.periodKey === bill.currentPeriodKey)[0] ?? bill.payment;
    if (!latest) return;
    // Asked first: it takes the payment back and deletes the expense it wrote,
    // and one tap used to do both. The dialog says which, how much and when.
    setDetailBill(null);
    setUndoTarget({ bill, payment: latest });
  };

  // Correcting a payment edits the expense it wrote rather than adding another:
  // paying 95 when the estimate said 110 is one payment recorded wrongly, not a
  // second payment.
  const handleEditPayment = (payment: BillPayment, changes: { amount?: number; paidDate?: Date }) => {
    if (changes.amount === undefined && changes.paidDate === undefined) return;
    // Optimistic, like every payment here: the toast as the change is applied;
    // a write that is lost puts the payment back and says so.
    void saveWithoutWaiting(updatePayment, { paymentId: payment.id, transactionId: payment.transactionId, ...changes }, () => toast.error(t("bills.editPaymentFailed")));
    toast.success(t("toasts.paymentUpdated"));
  };

  const handlePayPeriod = (bill: BillWithStatus, cell: MonthCell) => {
    if (!cell.periodKey) return;
    // Same hand-off as every other action here: never stack two modals.
    setDetailBill(null);
    setPayingPeriod(cell.periodKey);
    setPayingInstallment(cell.installment?.index);
    setPayingBill(bill);
  };

  const handleDeletePayment = (payment: BillPayment) => {
    void saveWithoutWaiting(unmarkPaid, { paymentId: payment.id, transactionId: payment.transactionId }, () => toast.error(t("bills.undoPaymentFailed")));
    toast.success(t(payment.transactionId ? "toasts.paymentUndoneWithExpense" : "toasts.paymentUndone"));
  };

  // Closes on the optimistic row rather than the server's answer, like every
  // other save here — see `saveWithoutWaiting`.
  const handleSubmit = (data: CreateBillDTO): Promise<void> => {
    const failed = () => toast.error(t("bills.saveFailed"));
    // A new bill's id is not known here: the row that appears is the one lit.
    celebrateSave({ collection: "bills", id: editBill?.id });
    toast.success(t(editBill ? "toasts.billUpdated" : "toasts.billCreated", { name: data.name }));
    return editBill ? saveWithoutWaiting(updateBill, { billId: editBill.id, data }, failed) : saveWithoutWaiting(createBill, data, failed);
  };

  /** On / off from «Διαχείριση»: optimistic, said at once, put back if lost. */
  const toggleBill = (bill: Bill, active: boolean) => {
    void saveWithoutWaiting(updateBill, { billId: bill.id, data: { isActive: active } }, () => toast.error(t("bills.saveFailed")));
    toast.success(t(active ? "toasts.billResumed" : "toasts.billPaused", { name: bill.name }));
  };

  const openNew = () => {
    setEditBill(null);
    setShowModal(true);
  };
  const openEdit = (bill: Bill) => {
    setEditBill(bill);
    setShowModal(true);
  };

  // Waits for the server (deletes are online only), 7 s at most; runs once,
  // the dialog locked meanwhile — then the toast says what happened. Past 7 s
  // the dialog lets go and the bill stays disabled until the answer
  // (`answerOrLetGo`).
  const [runDelete, deleting] = useRunOnce();
  // Records with an online-only action on its way (`answerOrLetGo`).
  const pending = usePendingRecords();
  const confirmDelete = () =>
    runDelete(() => {
      if (!deleteTarget) return;
      const bill = deleteTarget;
      return answerOrLetGo(() => deleteBill.mutateAsync(bill.id), {
        records: [["bills", bill.id]],
        close: () => setDeleteTarget((open) => (open?.id === bill.id ? null : open)),
        succeeded: () => toast.success(t("toasts.billDeleted", { name: bill.name })),
        failed: () => toast.error(t("toasts.billDeleteFailed")),
      });
    });
  const closeDelete = () => {
    if (!deleting) setDeleteTarget(null);
  };

  return (
    <PageShell>
      {/* The shared header card. The add on every view, «Σύνοψη» too. */}
      {/* No link tabs: «Σύνοψη · … · Όλα» are the sidebar's children — one row of tabs or
          selectors per page, and the views below get the room (owner, 2026-11-17), so this
          card holds the title alone; the list's views and density stay with the list. */}
      <PageHeader title={t("bills.title")} subtitle={t("bills.subtitle")} addLabel={t("bills.newBill")} onAdd={openNew} />

      {load === "waiting" && <PageWaiting />}

      {load === "loading" && (
        <Row className="g-3 g-lg-4">
          <Col xs={12} lg={7} xl={8}>
            <SkeletonCard className="mb-3">
              <SkeletonHeading width="50%" />
              <Skeleton height={8} style={{ borderRadius: 4 }} />
            </SkeletonCard>
            <SkeletonCard className="mb-3">
              <SkeletonHeading width="45%" />
              <SkeletonRows count={2} icon={false} />
            </SkeletonCard>
            <SkeletonRows count={5} />
          </Col>
          <Col xs={12} lg={5} xl={4}>
            <SkeletonChartCard height={180} />
          </Col>
        </Row>
      )}

      {load === "ready" && (
        <Row className={`g-3 g-lg-4 ${showFigures ? "" : "justify-content-center"}`}>
          {/* Summary + list */}
          <Col xs={12} lg={showFigures ? 7 : 12} xl={showFigures ? 8 : 9}>
            {showFigures && (
              <>
                <PeriodSummary breakdown={thisMonth} formatCurrency={formatCurrency} onOpenBreakdown={() => setBreakdownMonth(0)} />
                {bills.length > 0 && <NextMonthCard forecast={forecast} formatCurrency={formatCurrency} onOpenBreakdown={() => setBreakdownMonth(1)} />}
                <QuickStats
                  bills={bills}
                  formatCurrency={formatCurrency}
                  onOpenActive={() => setShowActive(true)}
                  onOpenOverdue={() => setShowOverdue(true)}
                  onOpenNext={() => setRunwayOpen({ upTo: 0, title: t("bills.nextUp") })}
                />
              </>
            )}

            {/* On a phone the two halves of this page take turns.

                These used to be the page's own buttons, marking the selected tab
                with a white-on-near-white fill: in dark mode #1f262f on #1e242c,
                a contrast of 1.03:1, which is no mark at all. The shared control
                has the same fill and adds a border — which is what actually says
                "this one" — and it is the switcher every other page uses. */}
            {view === "all" && compact && bills.length > 0 && (
              <ViewSwitch
                block
                className="mb-3"
                label={t("bills.title")}
                value={mobileView}
                onChange={setMobileView}
                options={[
                  { id: "bills", label: t("bills.tabBills") },
                  { id: "year", label: t("bills.tabYear") },
                ]}
              />
            )}

            {bills.length === 0 ? (
              <div className="text-center text-body-secondary" style={{ padding: "3rem 0" }}>
                <p style={{ fontSize: 40 }}>🧾</p>
                <p className="fw-medium mb-1">{t("bills.noBillsYet")}</p>
                <p className="small mb-3">{t("bills.noBillsHint")}</p>
                <Button color="primary" onClick={openNew}>
                  + {t("bills.newBill")}
                </Button>
              </div>
            ) : view === "all" && compact && mobileView === "year" ? (
              <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} onOpenCategory={(id, label) => setOpenCategory({ id, label })} />
            ) : (
              <>
                {showFigures && (
                  <CashRunway
                    checkpoints={runway}
                    formatCurrency={formatCurrency}
                    onOpen={(index) =>
                      setRunwayOpen({ upTo: index, title: runway[index].overdue ? t("bills.runwayNow") : t("bills.runwayBy", { date: runwayDateFmt.format(runway[index].date) }) })
                    }
                  />
                )}

                {view === "manage" && (
                  <BillManage
                    flash={billFlash}
                    bills={bills}
                    categoryFor={categoryFor}
                    now={now}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    deleteLocked={deleteGuard.locked}
                    deleteReason={deleteGuard.reason}
                    onToggle={toggleBill}
                  />
                )}

                {/* «Σύνοψη»: the twelve months to read, and on a phone the year under them. */}
                {view === "overview" && (
                  <>
                    <BillYearAhead months={monthsAhead} formatCurrency={formatCurrency} locale={i18n.resolvedLanguage ?? "en"} onOpenMonth={setBreakdownMonth} />
                    {compact && <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} onOpenCategory={(id, label) => setOpenCategory({ id, label })} />}
                  </>
                )}

                {/* Views on the left, density on the right (stacked on a phone), both
                    fixed in place: off «Λίστα» the density keeps its room, hidden, so
                    nothing moves when the view or the density changes (owner, 2026-11-17). */}
                {showList && (
                  <div className={styles.viewBar}>
                    <BillViewToggle view={billView} onChange={setBillView} />
                    <div className={listShown ? undefined : styles.viewBarHidden} aria-hidden={!listShown || undefined} inert={!listShown}>
                      <DensitySwitch value={density} onChange={setDensity} />
                    </div>
                  </div>
                )}

                {showList && billView === "month" && (
                  <BillMonthTimeline timeline={timeline} now={now} formatCurrency={formatCurrency} locale={i18n.resolvedLanguage ?? "en"} onOpenBill={setDetailBill} />
                )}

                {/* «Η χρονιά»: the twelve months ahead, then what each bill costs a year. */}
                {showList && billView === "year" && (
                  <div className="d-flex flex-column gap-3">
                    <BillYearAhead months={monthsAhead} formatCurrency={formatCurrency} locale={i18n.resolvedLanguage ?? "en"} onOpenMonth={setBreakdownMonth} />
                    <BillYearCost bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} onOpenBill={setDetailBill} />
                  </div>
                )}

                {listShown &&
                  sections.map((section) => (
                  <div
                    key={section.key}
                    className={`mb-3 ${section.key === "later" || section.key === "stopped" ? styles.sectionResting : ""}`}
                    data-tour={section.key === "outstanding" ? "bills-outstanding" : undefined}
                  >
                    <div className={styles.listSection}>
                      <span className={styles.listSectionTitle} style={{ color: section.tone }}>
                        {section.title}
                        <span className={styles.listSectionCount}>{t("bills.billCount", { count: section.bills.length })}</span>
                      </span>
                      {section.total !== undefined ? (
                        <span className={styles.listSectionTotal} style={{ color: section.tone }}>
                          {formatCurrency(section.total)}
                        </span>
                      ) : (
                        <span className={styles.listSectionCount}>{section.note}</span>
                      )}
                    </div>

                    <BillStrip
                      bills={section.bills}
                      section={section.key}
                      density={density}
                      formatCurrency={formatCurrency}
                      categoryFor={categoryFor}
                      onOpenDetails={setDetailBill}
                      now={now}
                      flash={billFlash}
                    />
                  </div>
                ))}
              </>
            )}
          </Col>

          {/* Beside the list on desktop. On a phone it is one of the two tabs
              above instead, so it is never mounted twice. */}
          {!compact && showFigures && (
            <Col xs={12} lg={5} xl={4}>
              <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} onOpenCategory={(id, label) => setOpenCategory({ id, label })} />
            </Col>
          )}
        </Row>
      )}

      {/* ── Modals (unchanged) ── */}
      <AddBillModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        categories={categories}
        bill={editBill}
        onSubmit={handleSubmit}
        // Delete far left on an edit: the form closes and the page's own confirm asks.
        onDelete={
          editBill
            ? () => {
                setShowModal(false);
                setDeleteTarget(bills.find((b) => b.id === editBill.id) ?? null);
              }
            : undefined
        }
        deleteLocked={deleteGuard.locked}
        deleteReason={deleteGuard.reason}
      />

      {/* Every active bill in one place, reached from the count that names
          them. The same component the yearly projection opens a category into —
          it is the same question asked of a different set. */}
      <ActiveBillsModal
        isOpen={showActive}
        bills={activeBills}
        formatCurrency={formatCurrency}
        onClose={() => setShowActive(false)}
        // Opened over the list, which stays open under it: closing the bill
        // leaves you where you were in the list, scroll and all.
        onOpenBill={setDetailBill}
      />

      {/* What a "now / by …" figure is made of, or the next payment's day. */}
      <RunwaySheet
        checkpoints={runwayOpen ? runway.slice(0, runwayOpen.upTo + 1) : []}
        title={runwayOpen?.title ?? ""}
        formatCurrency={formatCurrency}
        onClose={() => setRunwayOpen(null)}
        onOpenBill={setDetailBill}
      />

      {/* The late ones, from the count that says how many. Same list as the
          active bills, told what matters here instead: how late, and what it
          comes to. */}
      {showOverdue && (
        <CategoryBillsModal
          label={t("bills.overdueCount")}
          icon="⏰"
          bills={late.bills}
          formatCurrency={formatCurrency}
          summary={{ left: t("bills.billsInCategory", { count: late.bills.length }), right: t("bills.owedTotal", { amount: formatCurrency(late.total) }), tone: "var(--color-expense-text)" }}
          describeRow={(bill) => {
            // How late is counted from the oldest payment still owed, and the
            // amount is all of it — the same figure the total above is made of,
            // so the rows add up to it.
            const overdue = billOverdue(bill);
            const days = daysUntilDeadline(bill) ?? 0;
            return {
              meta: t("bills.lateByDays", { count: Math.abs(days) }),
              amount: `${bill.isVariableAmount ? "~" : ""}${formatCurrency(overdue.total)}`,
              sub:
                overdue.count > 1 && overdue.oldestDue
                  ? t("bills.unpaidSince", { count: overdue.count, date: shortDateFmt.format(overdue.oldestDue) })
                  : overdue.oldestDeadline
                    ? t("bills.wasDueOn", { date: shortDateFmt.format(overdue.oldestDeadline) })
                    : "",
              tone: "var(--color-expense-text)",
            };
          }}
          onClose={() => setShowOverdue(false)}
          onOpenBill={setDetailBill}
        />
      )}

      {/* One category of the yearly projection, opened out. Handing a bill
          straight to the detail modal means the two never stack up. */}
      <CategoryBillsModal
        label={openCategory?.label ?? null}
        icon={openCategory ? categoryFor(openCategory.id)?.icon : undefined}
        bills={categoryBills}
        yearlyAmount={categoryBills.reduce((sum, b) => sum + b.monthlyEquivalent * 12, 0)}
        formatCurrency={formatCurrency}
        onClose={() => setOpenCategory(null)}
        onOpenBill={setDetailBill}
      />

      {liveDetailBill && (
        <BillDetailModal
          bill={liveDetailBill}
          categoryLabel={`${categoryFor(liveDetailBill.categoryId)?.icon ?? ""} ${categoryLabel(categoryFor(liveDetailBill.categoryId)?.name, t) || "—"}`.trim()}
          formatCurrency={formatCurrency}
          isBusy={pending.busy("bills", liveDetailBill.id)}
          onClose={() => setDetailBill(null)}
          onMarkPaid={(b) => {
            // Hand off to the confirmation step — never stack the two modals.
            setDetailBill(null);
            setPayingPeriod(undefined);
            setPayingPeriod(undefined);
            setPayingInstallment(undefined);
            setPayingBill(b);
          }}
          onUndoPayment={handleUndoPayment}
          onEditPayment={handleEditPayment}
          onDeletePayment={handleDeletePayment}
          onPayPeriod={handlePayPeriod}
          onToggle={(b, active) => {
            setDetailBill(null);
            toggleBill(b, active);
          }}
          onSettleOverdue={(b) => {
            // Same hand-off as Mark Paid — never stack two modals.
            setDetailBill(null);
            setSettlingBill(b);
          }}
          onEdit={(b) => {
            setDetailBill(null);
            openEdit(b);
          }}
          onDelete={(b) => {
            // Same hand-off as Edit and Mark Paid — never stack two modals.
            setDetailBill(null);
            setDeleteTarget(b);
          }}
        />
      )}

      {/* Closes at once, like every payment here: the cache already shows the
          months paid, and a write that fails rolls itself back and says so. */}
      {settlingBill && (
        <SettleOverdueModal
          bill={settlingBill}
          formatCurrency={formatCurrency}
          onClose={() => setSettlingBill(null)}
          onConfirm={(items) => {
            void saveWithoutWaiting(settleOverdue, { bill: settlingBill, items }, () => toast.error(t("bills.settleOverdueFailed")), [["bills", settlingBill.id]]);
            celebrateSave({ collection: "bills", id: settlingBill.id });
            toast.success(t("toasts.periodsSettled", { count: items.length, name: settlingBill.name }));
            setSettlingBill(null);
          }}
        />
      )}

      {payingBill && (
        <MarkPaidModal
          bill={payingBill}
          isSaving={false}
          presetPeriodKey={payingPeriod}
          presetInstallmentIndex={payingInstallment}
          onClose={() => setPayingBill(null)}
          onConfirm={handleConfirmPaid}
        />
      )}

      {/* `!== null`, not truthiness: this period is month 0. */}
      {breakdownMonth !== null && (
        <MonthBreakdownModal
          title={breakdownMonth === 0 ? t("bills.thisMonthTitle") : breakdownMonth === 1 ? t("bills.nextMonthTitle") : monthTitleFmt.format(new Date(now.getFullYear(), now.getMonth() + breakdownMonth, 1))}
          forecast={breakdownMonth === 0 ? thisMonth : breakdownMonth === 1 ? forecast : monthForecast(bills, now, breakdownMonth)}
          // Next month only. Debt from months gone by is exactly what "this
          // month" is not, and listing it here buried the two lines that
          // answer the question; the page carries its own overdue figure. A
          // plan for next month, though, is not honest while an earlier one
          // is still outstanding. Listed under the late tile's own name, and
          // the same items it counts: one walk, `arrears`, behind both.
          arrears={breakdownMonth === 1 ? owed : []}
          categoryFor={categoryFor}
          formatCurrency={formatCurrency}
          emptyText={breakdownMonth === 0 ? t("bills.nothingThisMonth") : t("bills.nothingNextMonth")}
          onClose={() => setBreakdownMonth(null)}
        />
      )}

      {/* Undoing a payment, confirmed: which one, how much, paid when — and that its expense goes with it. */}
      <Modal isOpen={!!undoTarget} toggle={() => setUndoTarget(null)} centered size="sm">
        <ModalHeader toggle={() => setUndoTarget(null)}>{t("bills.undoConfirmTitle")}</ModalHeader>
        <ModalBody>
          {undoTarget && (
            <>
              <p className="mb-2" style={{ fontSize: "var(--fs-lead)" }}>
                {t("bills.undoConfirmBody", {
                  name: undoTarget.bill.name,
                  amount: formatCurrency(undoTarget.payment.amount),
                  date: dateFormat("day", i18n.resolvedLanguage ?? "en").format(firestoreToDate(undoTarget.payment.paidDate)),
                })}
              </p>
              <p className="mb-0 text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
                {undoTarget.payment.transactionId ? t("bills.undoConfirmExpense") : t("bills.undoConfirmNoExpense")}
              </p>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setUndoTarget(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            color="warning"
            onClick={() => {
              // Optimistic: the dialog closes on the first press, so there is no second.
              if (undoTarget) handleDeletePayment(undoTarget.payment);
              setUndoTarget(null);
            }}
            disabled={!undoTarget}
          >
            {t("bills.undoPayment")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!deleteTarget} toggle={closeDelete} centered size="sm" backdrop={deleting ? "static" : true} keyboard={!deleting}>
        <ModalHeader toggle={deleting ? undefined : closeDelete}>{t("bills.deleteBill")}</ModalHeader>
        <ModalBody>
          {deleteTarget && <BillDeleteMessage bill={deleteTarget} />}
          {deleteGuard.locked && (
            <p className="mb-0 mt-2" style={{ fontSize: "var(--fs-small)", color: "var(--color-text-secondary)" }}>
              {deleteGuard.reason}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={closeDelete} disabled={deleting}>
            {t("common.cancel")}
          </Button>
          <Button color="danger" onClick={() => void confirmDelete()} disabled={deleting || deleteGuard.locked} aria-busy={deleting || undefined}>
            {deleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
}
