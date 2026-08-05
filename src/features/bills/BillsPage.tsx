import { useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Container, Row, Spinner, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiMoreVertical, FiCheck } from "react-icons/fi";
import type { Bill, BillWithStatus, CreateBillDTO, Category } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../transactions/hooks/useTransactions";
import { useBills, useCreateBill, useUpdateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid } from "./useBills";
import { computePeriodTotals, daysUntilDue, expectedAmount, getFrequencyLabel, getFrequencyToken, groupBills, monthsBetweenPayments, yearlyBreakdown } from "./billsUtils";
import { DROPDOWN_MENU_MODIFIERS } from "../../shared/utils/dropdown";
import { categoryLabel } from "../../shared/utils/categories";
import AddBillModal from "./AddBillModal";
import BillDetailModal from "./BillDetailModal";
import MarkPaidModal from "./MarkPaidModal";
import styles from "./css/BillsPage.module.css";

/** Bars in the yearly panel cycle through the semantic accents. */
const CATEGORY_COLORS = ["var(--bs-primary)", "var(--color-goal)", "var(--color-invest)", "var(--color-income)", "var(--color-expense)"];

/** Colour scale shared by the due-chip and the countdown ticks: red once
 * late, amber as it approaches, the default accent while there's still time. */
function dueColor(days: number | undefined): string {
  if (days === undefined) return "var(--color-text-secondary)";
  if (days < 0) return "var(--color-expense)";
  if (days <= 5) return "var(--color-goal)";
  return "var(--bs-primary)";
}

// ─── Period summary — the signature card ─────────────────────────────────────

function PeriodSummary({ bills, formatCurrency }: { bills: BillWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const totals = useMemo(() => computePeriodTotals(bills), [bills]);

  // The calendar month is the frame people think in, even for odd intervals.
  const periodEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }, []);
  const endLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(periodEnd);

  const settled = totals.due <= 0 && totals.totalCount > 0;

  return (
    <div className={`${styles.periodCard} p-3 p-lg-4 mb-3`}>
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
        </>
      )}
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

  // Soonest unpaid bill — the "what's next" answer the screen was missing.
  const nextBill = grouped.overdue[0] ?? grouped.upcoming.find((b) => b.nextDueDate);
  const nextDays = nextBill ? daysUntilDue(nextBill) : undefined;

  const nextValue =
    nextBill && nextBill.nextDueDate
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" }).format(nextBill.nextDueDate)
      : "—";
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

/** One pill that answers "where does this stand?" — paid, due soon, or late. */
function StatusChip({ bill }: { bill: BillWithStatus }) {
  const { t } = useTranslation();
  const days = daysUntilDue(bill);

  // Settled for this period: say so plainly. The countdown to the next one is
  // shown beside it on wide screens, so it doesn't need to shout here.
  if (bill.isPaidThisPeriod) {
    return (
      <span className={styles.statusChip} style={{ background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }}>
        ✓ {t("bills.paidRecently")}
      </span>
    );
  }

  if (days === undefined) {
    return <span className={`${styles.statusChip} text-body-secondary`} style={{ background: "var(--color-background-secondary)" }}>{t("bills.unpaid")}</span>;
  }

  const color = dueColor(days);
  const label = days < 0 ? t("bills.overdueByDays", { count: Math.abs(days) }) : days === 0 ? t("bills.dueToday") : t("bills.dueInDays", { count: days });

  return (
    <span className={styles.statusChip} style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      {label}
    </span>
  );
}

/** Column captions — desktop only; on a phone each figure carries its own label. */
function BillListHeader() {
  const { t } = useTranslation();
  return (
    <div className={`${styles.billRow} ${styles.listHeader} d-none d-md-grid`} aria-hidden>
      <span className={styles.rowIcon} />
      <span className={styles.rowMain}>{t("bills.colBill")}</span>
      <span className={styles.rowLastPaid}>{t("bills.colLastPaid")}</span>
      <span className={styles.rowPerMonth}>{t("bills.colPerMonth")}</span>
      <span className={styles.rowStatus}>{t("bills.colStatus")}</span>
      <span className={styles.rowMenu} />
    </div>
  );
}

// ─── Bill row ────────────────────────────────────────────────────────────────
// Information first: what was paid, when, what it usually costs, and what it
// works out to per month. The pay action lives in the ⋮ menu and the detail
// modal, so the row itself never spends space on buttons.
//
// One markup, two layouts. On a phone the four columns stack into three tight
// lines with every figure right-aligned, so amounts still read down the page;
// from `md` up the same cells snap back into real columns under a header.

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
    <span className={styles.rowSubtitle}>
      {t(freq.key, { count: freq.count })} · {amountNote}
    </span>
  );
}

function BillRow({
  bill,
  category,
  formatCurrency,
  onOpenDetails,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  bill: BillWithStatus;
  category: Category | undefined;
  formatCurrency: (n: number) => string;
  onOpenDetails: (b: BillWithStatus) => void;
  onMarkPaid: (b: BillWithStatus) => void;
  onEdit: (b: BillWithStatus) => void;
  onDelete: (b: BillWithStatus) => void;
}) {
  const { t, i18n } = useTranslation();
  const freqToken = getFrequencyToken(bill);
  const paid = bill.isPaidThisPeriod;
  const days = daysUntilDue(bill);
  const overdue = !paid && (days ?? 0) < 0;

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" });
  const lastPaidAmount = bill.payments[0]?.amount;

  // "Per month" only says something when the bill isn't already monthly.
  const showPerMonth = monthsBetweenPayments(bill) !== 1;

  return (
    <div
      className={`${styles.billRow} ${overdue ? styles.billRowOverdue : ""}`}
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
      <span className={`${styles.iconTile} ${styles.rowIcon}`} aria-hidden>
        {category?.icon ?? "🧾"}
      </span>

      {/* Name and subtitle are separate grid children: on a phone they occupy
          two different rows, each paired with its own figure on the right. */}
      <span className={`${styles.rowMain} fw-semibold text-body-emphasis text-truncate`} style={{ fontSize: 14 }}>
        {bill.name}
      </span>
      <BillSubtitle bill={bill} formatCurrency={formatCurrency} />

      {/* What actually left the account last time. The date rides with the
          status chip on a phone so this column stays exactly one line tall. */}
      <div className={styles.rowLastPaid}>
        <span className={styles.cellValue}>{lastPaidAmount !== undefined ? formatCurrency(lastPaidAmount) : "—"}</span>
        <span className={`${styles.cellSub} d-none d-md-block`}>{bill.lastPaidDate ? dateFmt.format(bill.lastPaidDate) : t("bills.neverPaid")}</span>
      </div>

      <div className={styles.rowPerMonth}>
        {showPerMonth ? (
          <>
            <span className={styles.cellValue}>{formatCurrency(bill.monthlyEquivalent)}</span>
            <span className={`${styles.cellSub} d-md-none`}>{t("bills.perMonthShort")}</span>
          </>
        ) : (
          <span className={styles.cellSub}>—</span>
        )}
      </div>

      <div className={styles.rowStatus}>
        <StatusChip bill={bill} />
        {/* Phone: when it was last paid. Desktop: that lives in its own column,
            so the space goes to the next due date instead. */}
        <span className={`${styles.cellSub} d-md-none ms-1`}>{bill.lastPaidDate ? dateFmt.format(bill.lastPaidDate) : t("bills.neverPaid")}</span>
        {paid && bill.nextDueDate && <span className={`${styles.cellSub} d-none d-md-block`}>{t("bills.nextShort", { date: dateFmt.format(bill.nextDueDate) })}</span>}
      </div>

      <UncontrolledDropdown className={styles.rowMenu} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DropdownToggle tag="button" className="btn btn-link text-body-secondary p-1 border-0" aria-label={t("bills.viewDetails")}>
          <FiMoreVertical size={18} />
        </DropdownToggle>
        <DropdownMenu end modifiers={DROPDOWN_MENU_MODIFIERS}>
          {!paid && (
            <DropdownItem onClick={() => onMarkPaid(bill)}>
              <FiCheck size={14} className="me-2" />
              {t("bills.markAsPaid")}
            </DropdownItem>
          )}
          <DropdownItem onClick={() => onOpenDetails(bill)}>{t("bills.viewDetails")}</DropdownItem>
          <DropdownItem onClick={() => onEdit(bill)}>{t("common.edit")}</DropdownItem>
          <DropdownItem className="text-danger" onClick={() => onDelete(bill)}>
            {t("common.delete")}
          </DropdownItem>
        </DropdownMenu>
      </UncontrolledDropdown>

      {/* Cadence colour is still worth keeping, but as a hairline on the edge
          rather than another chip competing for space. */}
      <span className={styles.rowCadenceBar} style={{ background: `var(${freqToken})` }} aria-hidden />
    </div>
  );
}

// ─── Yearly projection ───────────────────────────────────────────────────────

function YearlyProjection({ bills, categoryFor, formatCurrency }: { bills: BillWithStatus[]; categoryFor: (id: string) => Category | undefined; formatCurrency: (n: number) => string }) {
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

          <div className="d-flex flex-column gap-2">
            {categories.map((c, i) => (
              <div key={c.categoryId}>
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
              </div>
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

  const [showModal, setShowModal] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillWithStatus | null>(null);
  const [detailBill, setDetailBill] = useState<BillWithStatus | null>(null);
  const [payingBill, setPayingBill] = useState<BillWithStatus | null>(null);

  const categoryFor = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return (id: string) => map.get(id);
  }, [categories]);

  // One continuous list ordered by how soon the next payment is due —
  // overdue bills float to the top (negative days), paid ones keep their
  // spot in line rather than being tucked away in a separate section.
  const sortedBills = useMemo(() => {
    return [...bills].sort((a, b) => {
      const da = daysUntilDue(a) ?? Number.MAX_SAFE_INTEGER;
      const db = daysUntilDue(b) ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [bills]);
  const busy = markPaid.isPending || unmarkPaid.isPending;

  // Keep an open detail modal in sync after a payment lands or is undone.
  const liveDetailBill = detailBill ? (bills.find((b) => b.id === detailBill.id) ?? null) : null;

  const handleConfirmPaid = (amountInBase: number, paidDate: Date) => {
    if (!payingBill) return;
    markPaid.mutate({ bill: payingBill, paidDate, paidAmount: amountInBase }, { onSuccess: () => setPayingBill(null) });
  };

  const handleUndoPayment = (bill: BillWithStatus) => {
    if (!bill.payment) return;
    unmarkPaid.mutate({ paymentId: bill.payment.id, transactionId: bill.payment.transactionId });
  };

  const handleSubmit = async (data: CreateBillDTO): Promise<void> => {
    if (editBill) {
      await new Promise<void>((resolve, reject) => updateBill.mutate({ billId: editBill.id, data }, { onSuccess: () => resolve(), onError: reject }));
    } else {
      await new Promise<void>((resolve, reject) => createBill.mutate(data, { onSuccess: () => resolve(), onError: reject }));
    }
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

  const renderRow = (bill: BillWithStatus) => (
    <BillRow
      key={bill.id}
      bill={bill}
      category={categoryFor(bill.categoryId)}
      formatCurrency={formatCurrency}
      onOpenDetails={setDetailBill}
      onMarkPaid={setPayingBill}
      onEdit={openEdit}
      onDelete={setDeleteTarget}
    />
  );

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
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}
      {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

      {!isLoading && !isError && (
        <Row className="g-3 g-lg-4">
          {/* Summary + list */}
          <Col xs={12} lg={7} xl={8}>
            <PeriodSummary bills={bills} formatCurrency={formatCurrency} />
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
                <BillListHeader />
                <div className="d-flex flex-column gap-2">{sortedBills.map(renderRow)}</div>
              </>
            )}
          </Col>

          {/* Yearly projection — beside the list on desktop, below it on mobile */}
          <Col xs={12} lg={5} xl={4}>
            <YearlyProjection bills={bills} categoryFor={categoryFor} formatCurrency={formatCurrency} />
          </Col>
        </Row>
      )}

      {/* ── Modals (unchanged) ── */}
      <AddBillModal isOpen={showModal} onClose={() => setShowModal(false)} categories={categories} bill={editBill} onSubmit={handleSubmit} />

      {liveDetailBill && (
        <BillDetailModal
          bill={liveDetailBill}
          categoryLabel={`${categoryFor(liveDetailBill.categoryId)?.icon ?? ""} ${categoryLabel(categoryFor(liveDetailBill.categoryId)?.name, t) || "—"}`.trim()}
          formatCurrency={formatCurrency}
          isBusy={busy}
          onClose={() => setDetailBill(null)}
          onMarkPaid={(b) => {
            // Hand off to the confirmation step — never stack the two modals.
            setDetailBill(null);
            setPayingBill(b);
          }}
          onUndoPayment={handleUndoPayment}
          onEdit={(b) => {
            setDetailBill(null);
            openEdit(b);
          }}
        />
      )}

      {payingBill && <MarkPaidModal bill={payingBill} isSaving={markPaid.isPending} onClose={() => setPayingBill(null)} onConfirm={handleConfirmPaid} />}

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
