import { useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Container, Row, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import type { TFunction } from "i18next";
import { FiChevronRight, FiCheck, FiLock } from "react-icons/fi";
import type { Bill, BillPayment, BillWithStatus, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../transactions/hooks/useTransactions";
import { useBills, useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid, useUpdateBillPayment } from "./useBills";
import {
  arrears,
  billMonthStrip,
  billUrgency,
  cashRunway,
  daysUntilDeadline,
  expectedAmount,
  getFrequencyLabel,
  groupBills,
  isHardDeadline,
  isInGracePeriod,
  monthForecast,
  periodTotals,
  type MonthCell,
  supportsMonthStrip,
  URGENT_DAYS,
  urgencyToken,
  yearlyBreakdown,
  type MonthChip,
  type MonthForecast,
} from "./billsUtils";
import { categoryLabel } from "../../shared/utils/categories";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonRows } from "../../shared/components/Skeletons";
import AddBillModal from "./AddBillModal";
import BillDetailModal from "./BillDetailModal";
import CategoryBillsModal from "./CategoryBillsModal";
import MarkPaidModal from "./MarkPaidModal";
import MonthBreakdownModal from "./MonthBreakdownModal";
import styles from "./css/BillsPage.module.css";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";

/** Bars in the yearly panel cycle through the semantic accents. */
const CATEGORY_COLORS = ["var(--bs-primary)", "var(--color-goal)", "var(--color-invest)", "var(--color-income)", "var(--color-expense)"];

// ─── Cash runway — how much, by when ─────────────────────────────────────────

/**
 * The three nearest deadlines with a running total, so "what do I need in the
 * account, and by which day" is a figure you read rather than a sum you do.
 *
 * Deadlines, not due dates: an electricity bill three days past its due date
 * with three weeks of grace does not need the money today, and a subscription
 * due on the 15th absolutely does.
 */
function CashRunway({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const checkpoints = useMemo(() => cashRunway(bills), [bills]);

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" });

  if (checkpoints.length === 0) return null;

  return (
    <div className={styles.runway}>
      {checkpoints.map((checkpoint) => {
        // Colour tracks time pressure, not strictness — nearly every list has a
        // strict bill somewhere in it, so keying off that would paint all three
        // amber and say nothing. The lock icon carries strictness instead.
        const daysAway = Math.round((checkpoint.date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
        const color = checkpoint.overdue ? "var(--color-expense)" : daysAway <= URGENT_DAYS ? "var(--color-goal)" : "var(--color-text-primary)";

        return (
          <div key={checkpoint.date.toISOString()} className={styles.runwayBox}>
            <div className={styles.runwayDate}>{checkpoint.overdue ? t("bills.runwayNow") : t("bills.runwayBy", { date: dateFmt.format(checkpoint.date) })}</div>
            <div className={styles.runwayAmount} style={{ color }}>
              {formatCurrency(checkpoint.cumulative)}
            </div>
            <div className={styles.runwayNote}>
              {checkpoint.strictCount > 0 && <FiLock size={9} className="me-1" style={{ verticalAlign: "-1px", color: "var(--color-expense)" }} aria-hidden />}
              {t("bills.runwayBillCount", { count: checkpoint.cumulativeCount })}
            </div>
          </div>
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
  const endLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(periodEnd);

  const settled = totals.due <= 0 && totals.totalCount > 0;

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
      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
        <span className="text-uppercase fw-semibold text-body-secondary" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
          {settled ? t("bills.allSettled") : t("bills.toPayThisPeriod")}
        </span>
        <Badge color="secondary" pill style={{ fontSize: 10, fontWeight: 500 }}>
          {t("bills.periodEnds", { date: endLabel })}
        </Badge>
      </div>

      <div className="d-flex align-items-baseline flex-wrap gap-2 mb-1">
        <span className={`${styles.bigAmount} ${settled ? styles.bigAmountSettled : ""}`}>{formatCurrency(settled ? totals.paid : totals.due)}</span>
        {!settled && totals.total > 0 && (
          <span className="text-body-secondary" style={{ fontSize: 13 }}>
            {t("bills.ofTotal", { total: formatCurrency(totals.total) })}
          </span>
        )}
      </div>

      {totals.totalCount === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: 12 }}>
          {t("bills.noBillsHint")}
        </p>
      ) : (
        <>
          <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
            {settled ? t("bills.allSettledHint") : t("bills.alreadyPaid", { amount: formatCurrency(totals.paid) })}
          </p>

          <div className={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(totals.paidPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={styles.progressFill} style={{ width: `${Math.min(totals.paidPct, 100)}%` }} />
          </div>

          <div className="d-flex justify-content-between mt-2 text-body-secondary" style={{ fontSize: 11.5 }}>
            <span>{t("bills.pctCovered", { pct: Math.round(totals.paidPct) })}</span>
            <span>{t("bills.nOfMPending", { pending: totals.unpaidCount, total: totals.totalCount })}</span>
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

  const monthLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "long" }).format(forecast.monthStart);

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
      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
        <span className="text-uppercase fw-semibold text-body-secondary" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
          {t("bills.nextMonthTitle")}
        </span>
        <Badge color="secondary" pill style={{ fontSize: 10, fontWeight: 500 }}>
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

// ─── Quick stats ─────────────────────────────────────────────────────────────

function QuickStats({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const active = bills.filter((b) => b.isActive);
  const grouped = groupBills(active);
  const overdueCount = grouped.overdue.length;
  const avgMonthly = active.reduce((s, b) => s + b.monthlyEquivalent, 0);

  // Soonest unpaid bill, measured by when the money is actually needed.
  const nextBill = grouped.overdue[0] ?? grouped.upcoming.find((b) => b.deadline);
  const nextDays = nextBill ? daysUntilDeadline(nextBill) : undefined;

  const nextValue =
    nextBill && nextBill.deadline ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(nextBill.deadline) : "—";
  const nextSub = nextBill ? nextBill.name : t("bills.allSettled");
  const nextColor = nextDays === undefined ? "var(--color-text-secondary)" : nextDays < 0 ? "var(--color-expense)" : nextDays <= 5 ? "var(--color-goal)" : "var(--color-text-primary)";

  const stats = [
    {
      value: String(overdueCount),
      label: t("bills.overdueCount"),
      color: overdueCount > 0 ? "var(--color-expense)" : "var(--color-text-primary)",
      sub: overdueCount > 0 ? formatCurrency(grouped.overdue.reduce((s, b) => s + expectedAmount(b), 0)) : t("bills.noneLate"),
    },
    { value: nextValue, label: t("bills.nextUp"), color: nextColor, sub: nextSub },
    { value: formatCurrency(avgMonthly), label: t("bills.avgMonthly"), color: "var(--bs-primary)", sub: t("bills.perYearShort", { amount: formatCurrency(avgMonthly * 12) }) },
    {
      value: String(active.length),
      label: t("bills.totalActive"),
      color: "var(--color-invest)",
      sub: bills.length > active.length ? t("bills.pausedCount", { count: bills.length - active.length }) : t("bills.allRunning"),
    },
  ];

  return (
    <Row className="g-2 mb-4">
      {stats.map((s) => (
        <Col xs={6} lg={3} key={s.label}>
          <div className={styles.statBox}>
            <div className={styles.statValue} style={{ color: s.color }}>
              {s.value}
            </div>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statSub}>{s.sub}</div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── Due indicator ───────────────────────────────────────────────────────────

/**
 * One pill that answers "where does this stand?" — counted against the
 * deadline, so a bill sitting comfortably inside its grace window doesn't wear
 * the same red as one that has genuinely lapsed.
 */
function StatusChip({ bill }: { bill: BillWithStatus }) {
  const { t } = useTranslation();
  const urgency = billUrgency(bill);
  const color = `var(${urgencyToken(urgency)})`;

  if (urgency === "paid") {
    return (
      <span className={styles.statusChip} style={{ background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }}>
        ✓ {t("bills.paidRecently")}
      </span>
    );
  }

  const days = daysUntilDeadline(bill);
  if (days === undefined) {
    return <span className={`${styles.statusChip} text-body-secondary`} style={{ background: "var(--color-background-secondary)" }}>{t("bills.unpaid")}</span>;
  }

  const label = days < 0 ? t("bills.lateByDays", { count: Math.abs(days) }) : days === 0 ? t("bills.dueToday") : t("bills.dueInDays", { count: days });

  return (
    <span className={styles.statusChip} style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
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
function deadlineFact(bill: BillWithStatus, t: TFunction, dateFmt: Intl.DateTimeFormat): { label: string; value: string; color?: string } {
  if (bill.isPaidThisPeriod) {
    return { label: t("bills.labelNextDue"), value: bill.nextDueDate ? dateFmt.format(bill.nextDueDate) : "—" };
  }
  if (!bill.deadline) return { label: t("bills.labelPayBy"), value: "—" };

  // Inside the grace window the two dates differ, and the later one is the one
  // that matters — say so explicitly rather than showing a date that has passed.
  const grace = isInGracePeriod(bill);
  const days = daysUntilDeadline(bill);
  return {
    label: grace ? t("bills.labelGraceUntil") : t("bills.labelPayBy"),
    value: dateFmt.format(bill.deadline),
    color: days !== undefined && days < 0 ? "var(--color-expense)" : undefined,
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

/** "Every 2 months · usually €80–122" — the descriptive half of the first cell. */
function BillSubtitle({ bill, formatCurrency }: { bill: BillWithStatus; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const freq = getFrequencyLabel(bill);
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
      {t(freq.key, { count: freq.count })} · {amountNote}
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

/* Solid fills for what has happened or is happening; the coming months are
   hatched instead, so "will owe" never reads as a washed-out "owes now". */
const chipTone = (status: MonthChip["status"]) => (status === "paid" ? "var(--color-income)" : status === "due" ? "var(--color-expense)" : undefined);

function MonthStrip({ bill, now }: { bill: BillWithStatus; now: Date }) {
  const { t, i18n } = useTranslation();
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short" }), [i18n.resolvedLanguage]);
  const chips = useMemo(() => billMonthStrip(bill, now), [bill, now]);

  const labelFor = (status: MonthChip["status"]) =>
    status === "paid" ? t("bills.monthPaid") : status === "due" ? t("bills.monthDue") : status === "future" ? t("bills.monthFuture") : t("bills.monthEmpty");

  return (
    <div className={styles.monthStrip} onClick={(e) => e.stopPropagation()}>
      {chips.map((chip) => (
        <div
          key={chip.key}
          className={`${styles.monthChip} ${chip.status === "paid" || chip.status === "due" ? styles.monthChipFilled : ""} ${chip.status === "future" ? styles.monthChipFuture : ""}`}
          style={{ background: chipTone(chip.status), color: chip.status === "paid" || chip.status === "due" ? "#fff" : undefined }}
          title={`${monthFmt.format(chip.start)} — ${labelFor(chip.status)}`}
        >
          {monthFmt.format(chip.start)}
        </div>
      ))}
    </div>
  );
}

// ─── Bill card ───────────────────────────────────────────────────────────────
// One card per bill carrying everything there is to know about it: what it is,
// where it stands, the three figures worth comparing, and the cadence strip.
//
// It used to be two views behind a toggle — a dense table of figures, or the
// month strips — which made every visit start with a choice nobody wanted to
// make, and hid half the information behind the wrong answer. The table was
// also the source of the cramped phone layout: columns sized for a desktop
// header, folded onto a 375px screen, put figures wherever they happened to
// land. Labelled cells in a grid stay legible at any width, so the same card
// now serves both screens and simply breathes more on the larger one.
//
// Every action — pay, edit, delete — still lives one tap away in the detail
// modal; the card is the only affordance, with a chevron as a visual hint.

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

function BillCard({
  bill,
  category,
  formatCurrency,
  onOpenDetails,
  now,
}: {
  bill: BillWithStatus;
  category: Category | undefined;
  formatCurrency: (n: number) => string;
  onOpenDetails: (b: BillWithStatus) => void;
  now: Date;
}) {
  const { t, i18n } = useTranslation();
  const paid = bill.isPaidThisPeriod;
  const urgency = billUrgency(bill);
  const strict = isHardDeadline(bill);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }), [i18n.resolvedLanguage]);
  const lastPaidAmount = bill.payments[0]?.amount;
  const deadline = deadlineFact(bill, t, dateFmt);

  return (
    <div
      className={`${styles.billCard} ${paid ? styles.billCardPaid : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(bill)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails(bill);
        }
      }}
      title={t("bills.viewDetails")}
    >
      <span className={styles.rowStateBar} style={{ background: `var(${urgencyToken(urgency)})` }} aria-hidden />

      <div className={styles.cardHead}>
        <span className={`${styles.iconTile} ${styles.iconWrap}`}>
          <span aria-hidden>{category?.icon ?? "🧾"}</span>
          {/* A tick on the icon as well as the colour bar, so "paid" survives a
              greyscale screen or a colour-blind reader. */}
          {paid && (
            <span className={styles.paidTick} title={t("bills.paidRecently")}>
              <FiCheck size={9} aria-hidden />
            </span>
          )}
        </span>

        <div className={styles.cardTitles}>
          <span className={`${styles.cardName} fw-semibold text-body-emphasis text-truncate`}>
            {bill.name}
            {strict && !paid && <FiLock size={11} className={styles.strictMark} title={t("bills.strictHint")} />}
          </span>
          <BillSubtitle bill={bill} formatCurrency={formatCurrency} />
        </div>

        <div className={styles.cardAside}>
          <StatusChip bill={bill} />
          {/* Paid ahead is the one state the chip can't express: this period is
              settled AND so is the next, which is not the same as merely paid. */}
          {bill.paidAheadCount > 0 && <span className={styles.aheadChip}>⏩ {t("bills.paidAheadShort", { count: bill.paidAheadCount })}</span>}
        </div>

        <FiChevronRight size={18} className={styles.cardChevron} aria-hidden />
      </div>

      <div className={styles.cardMetrics}>
        <Metric
          label={t("bills.colLastPaid")}
          value={lastPaidAmount !== undefined ? formatCurrency(lastPaidAmount) : "—"}
          sub={bill.lastPaidDate ? dateFmt.format(bill.lastPaidDate) : t("bills.neverPaid")}
        />
        <Metric label={t("bills.colPerMonth")} value={formatCurrency(bill.monthlyEquivalent)} sub={t("bills.perMonthShort")} />
        <Metric label={deadline.label} value={deadline.value} color={deadline.color} sub={bill.deadline || paid ? undefined : t("bills.noDueDateSet")} />
      </div>

      {/* Weekly is the one cadence a strip of calendar months can't represent —
          several of its periods land inside a single month. */}
      {supportsMonthStrip(bill) && <MonthStrip bill={bill} now={now} />}
    </div>
  );
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

  return (
    <div className={`${styles.yearlyCard} p-3 p-lg-4`}>
      <div className="mb-3">
        <div className="fw-semibold" style={{ fontSize: 14 }}>
          {t("bills.yearlyProjection")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.yearlyProjectionHint")}</div>
      </div>

      {categories.length === 0 ? (
        <p className="mb-0" style={{ fontSize: 13, opacity: 0.75 }}>
          {t("bills.noBillsToProject")}
        </p>
      ) : (
        <>
          {/* Yearly headline, with the monthly equivalent below it — the two
              figures people actually budget against. */}
          <div className="d-flex align-items-baseline justify-content-between gap-2">
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.perYear")}</span>
            <span className={styles.yearlyAmount}>{formatCurrency(total)}</span>
          </div>

          <hr className={styles.yearlyDivider} />

          <div className="d-flex align-items-baseline justify-content-between gap-2 mb-3">
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("bills.monthlyEquivalentLabel")}</span>
            <span className="fw-semibold" style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(total / 12)}
              <span className="fw-normal ms-1" style={{ fontSize: 11, opacity: 0.7 }}>
                {t("bills.perMonthShort")}
              </span>
            </span>
          </div>

          <hr className={styles.yearlyDivider} />

          <div className="text-uppercase mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", opacity: 0.6 }}>
            {t("bills.byCategory")}
          </div>
          <div className="mb-2" style={{ fontSize: 10.5, opacity: 0.6 }}>
            {t("bills.tapCategoryHint")}
          </div>

          <div className="d-flex flex-column gap-2">
            {categories.map((c, i) => (
              <button key={c.categoryId} type="button" className={styles.yearlyCategory} onClick={() => onOpenCategory(c.categoryId, c.label)}>
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1" style={{ fontSize: 12 }}>
                  <span className="text-truncate d-flex align-items-center gap-1">
                    <span aria-hidden>{categoryFor(c.categoryId)?.icon ?? "•"}</span>
                    {c.label}
                  </span>
                  <span className="flex-shrink-0 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(c.yearlyAmount)} <span style={{ opacity: 0.6 }}>{Math.round(c.percentage)}%</span>
                    <span className="d-block" style={{ fontSize: 10, opacity: 0.55 }}>
                      {formatCurrency(c.yearlyAmount / 12)} {t("bills.perMonthShort")}
                    </span>
                  </span>
                </div>
                <div className={styles.yearlyTrack}>
                  <div className={styles.yearlyFill} style={{ width: `${c.percentage}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
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

export default function BillsPage() {
  const { t } = useTranslation();
  const { data: bills = [], isLoading, isError } = useBills();
  const { data: categories = [] } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();

  const createBill = useCreateBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  const markPaid = useMarkBillPaid();
  const unmarkPaid = useUnmarkBillPaid();
  const updatePayment = useUpdateBillPayment();

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
  // Which month's breakdown is open, if any.
  const [breakdownMonth, setBreakdownMonth] = useState<"current" | "next" | null>(null);
  // One clock reading for the whole visit, so every card's month strip lines up
  // on the same window instead of drifting across renders.
  const [now] = useState(() => new Date());

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
  const sections = useMemo(() => {
    const byDeadline = (a: BillWithStatus, b: BillWithStatus) => (daysUntilDeadline(a) ?? Number.MAX_SAFE_INTEGER) - (daysUntilDeadline(b) ?? Number.MAX_SAFE_INTEGER);
    const outstanding = bills.filter((b) => !b.isPaidThisPeriod).sort(byDeadline);
    // Most recently settled first — the useful order for a section you scan
    // only to confirm something went through.
    const settled = bills.filter((b) => b.isPaidThisPeriod).sort((a, b) => (b.lastPaidDate?.getTime() ?? 0) - (a.lastPaidDate?.getTime() ?? 0));

    return [
      { key: "outstanding", title: t("bills.sectionOutstanding"), bills: outstanding, total: outstanding.reduce((s, b) => s + expectedAmount(b), 0), tone: "var(--color-expense)" },
      { key: "settled", title: t("bills.sectionSettled"), bills: settled, total: settled.reduce((s, b) => s + (b.payment?.amount ?? b.amount), 0), tone: "var(--color-income)" },
    ].filter((section) => section.bills.length > 0);
  }, [bills, t]);

  // Keep an open detail modal in sync after a payment lands or is undone.
  const liveDetailBill = detailBill ? (bills.find((b) => b.id === detailBill.id) ?? null) : null;
  const categoryBills = useMemo(
    () => (openCategory ? bills.filter((b) => b.isActive && b.categoryId === openCategory.id).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent) : []),
    [bills, openCategory],
  );

  // Both of these close their dialog straight away rather than on the server's
  // answer. The cache has already been updated optimistically, so the screen is
  // correct the moment it closes; a write that then fails rolls itself back and
  // says so, which beats holding the whole page hostage to the network.
  const handleConfirmPaid = (amountInBase: number, paidDate: Date, periodKey: string, installmentIndex?: number) => {
    if (!payingBill) return;
    markPaid.mutate({ bill: payingBill, paidDate, paidAmount: amountInBase, periodKey, installmentIndex }, { onError: () => toast.error(t("bills.markPaidFailed")) });
    setPayingBill(null);
  };

  const handleUndoPayment = (bill: BillWithStatus) => {
    // The most recent instalment, not "the payment": undoing a part-paid year
    // has to take back the last part rather than an arbitrary one.
    const latest = bill.payments.filter((p) => p.periodKey === bill.currentPeriodKey)[0] ?? bill.payment;
    if (!latest) return;
    handleDeletePayment(latest);
  };

  // Correcting a payment edits the expense it wrote rather than adding another:
  // paying 95 when the estimate said 110 is one payment recorded wrongly, not a
  // second payment.
  const handleEditPayment = (payment: BillPayment, changes: { amount?: number; paidDate?: Date }) => {
    if (changes.amount === undefined && changes.paidDate === undefined) return;
    updatePayment.mutate(
      { paymentId: payment.id, transactionId: payment.transactionId, ...changes },
      { onError: () => toast.error(t("bills.editPaymentFailed")) },
    );
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
    unmarkPaid.mutate({ paymentId: payment.id, transactionId: payment.transactionId }, { onError: () => toast.error(t("bills.undoPaymentFailed")) });
  };

  // Closes on the optimistic row rather than the server's answer, like every
  // other save here — see `saveWithoutWaiting`.
  const handleSubmit = (data: CreateBillDTO): Promise<void> => {
    const failed = () => toast.error(t("bills.saveFailed"));
    return editBill ? saveWithoutWaiting(updateBill, { billId: editBill.id, data }, failed) : saveWithoutWaiting(createBill, data, failed);
  };

  const openNew = () => {
    setEditBill(null);
    setShowModal(true);
  };
  const openEdit = (bill: Bill) => {
    setEditBill(bill);
    setShowModal(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteBill.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("bills.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("bills.subtitle")}</p>
        </div>
        <Button color="primary" onClick={openNew} className="flex-shrink-0">
          <span className="d-none d-sm-inline">+ {t("bills.newBill")}</span>
          <span className="d-sm-none">+</span>
        </Button>
      </div>

      {isLoading && (
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
      {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

      {!isLoading && !isError && (
        <Row className="g-3 g-lg-4">
          {/* Summary + list */}
          <Col xs={12} lg={7} xl={8}>
            <PeriodSummary breakdown={thisMonth} formatCurrency={formatCurrency} onOpenBreakdown={() => setBreakdownMonth("current")} />
            {bills.length > 0 && <NextMonthCard forecast={forecast} formatCurrency={formatCurrency} onOpenBreakdown={() => setBreakdownMonth("next")} />}
            <QuickStats bills={bills} formatCurrency={formatCurrency} />

            {bills.length === 0 ? (
              <div className="text-center text-body-secondary" style={{ padding: "3rem 0" }}>
                <p style={{ fontSize: 40 }}>🧾</p>
                <p className="fw-medium mb-1">{t("bills.noBillsYet")}</p>
                <p className="small mb-3">{t("bills.noBillsHint")}</p>
                <Button color="primary" onClick={openNew}>
                  + {t("bills.newBill")}
                </Button>
              </div>
            ) : (
              <>
                <CashRunway bills={bills} formatCurrency={formatCurrency} />

                {sections.map((section) => (
                  <div key={section.key} className="mb-3">
                    <div className={styles.listSection}>
                      <span className={styles.listSectionTitle} style={{ color: section.tone }}>
                        {section.title}
                        <span className={styles.listSectionCount}>{t("bills.billCount", { count: section.bills.length })}</span>
                      </span>
                      <span className={styles.listSectionTotal} style={{ color: section.tone }}>
                        {formatCurrency(section.total)}
                      </span>
                    </div>

                    <div className="d-flex flex-column gap-2">
                      {section.bills.map((bill) => (
                        <BillCard key={bill.id} bill={bill} category={categoryFor(bill.categoryId)} formatCurrency={formatCurrency} onOpenDetails={setDetailBill} now={now} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </Col>

          {/* Yearly projection — beside the list on desktop, below it on mobile */}
          <Col xs={12} lg={5} xl={4}>
            <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} onOpenCategory={(id, label) => setOpenCategory({ id, label })} />
          </Col>
        </Row>
      )}

      {/* ── Modals (unchanged) ── */}
      <AddBillModal isOpen={showModal} onClose={() => setShowModal(false)} categories={categories} bill={editBill} onSubmit={handleSubmit} />

      {/* One category of the yearly projection, opened out. Handing a bill
          straight to the detail modal means the two never stack up. */}
      <CategoryBillsModal
        label={openCategory?.label ?? null}
        icon={openCategory ? categoryFor(openCategory.id)?.icon : undefined}
        bills={categoryBills}
        yearlyAmount={categoryBills.reduce((sum, b) => sum + b.monthlyEquivalent * 12, 0)}
        formatCurrency={formatCurrency}
        onClose={() => setOpenCategory(null)}
        onOpenBill={(bill) => {
          setOpenCategory(null);
          setDetailBill(bill);
        }}
      />

      {liveDetailBill && (
        <BillDetailModal
          bill={liveDetailBill}
          categoryLabel={`${categoryFor(liveDetailBill.categoryId)?.icon ?? ""} ${categoryLabel(categoryFor(liveDetailBill.categoryId)?.name, t) || "—"}`.trim()}
          formatCurrency={formatCurrency}
          isBusy={deleteBill.isPending}
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

      {breakdownMonth && (
        <MonthBreakdownModal
          title={breakdownMonth === "current" ? t("bills.thisMonthTitle") : t("bills.nextMonthTitle")}
          forecast={breakdownMonth === "current" ? thisMonth : forecast}
          // Next month only. Debt from months gone by is exactly what "this
          // month" is not, and listing it here buried the two lines that
          // answer the question; the page carries its own overdue figure. A
          // plan for next month, though, is not honest while an earlier one
          // is still outstanding.
          arrears={breakdownMonth === "next" ? owed : []}
          categoryFor={categoryFor}
          formatCurrency={formatCurrency}
          emptyText={breakdownMonth === "current" ? t("bills.nothingThisMonth") : t("bills.nothingNextMonth")}
          onClose={() => setBreakdownMonth(null)}
        />
      )}

      <Modal isOpen={!!deleteTarget} toggle={() => setDeleteTarget(null)} centered size="sm">
        <ModalHeader toggle={() => setDeleteTarget(null)}>{t("bills.deleteBill")}</ModalHeader>
        <ModalBody>
          <p className="mb-0" style={{ fontSize: 14 }}>
            {t("bills.deleteConfirm", { name: deleteTarget?.name ?? "" })}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setDeleteTarget(null)} disabled={deleteBill.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="danger" onClick={confirmDelete} disabled={deleteBill.isPending}>
            {deleteBill.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </ModalFooter>
      </Modal>
    </Container>
  );
}
