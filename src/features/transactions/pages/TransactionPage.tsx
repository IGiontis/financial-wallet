import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Row, Col, Card, CardBody, Table, Badge, Button, Alert, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { FiEdit2, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { useTransactions, useCategories, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from "../hooks/useTransactions";
import { useTranslation } from "react-i18next";
import { useDebounce } from "../../../shared/hooks/useDebounce";
import { SearchInput } from "../../../shared/components/SearchInput";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import type { CreateTransactionDTO, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { Skeleton, SkeletonCard, SkeletonHeading, SkeletonRows, SkeletonTable } from "../../../shared/components/Skeletons";
import { firestoreToDate } from "../../../shared/utils/dates";
import { localeUpperCase } from "../../../shared/utils/upperCase";
import { midnight, formatTable } from "../transactionDates";
import { TransactionCalendar, MobileCalendar } from "../components/TransactionCalendar";
import { tapDay } from "../dateRanges";
import ManagePayeesModal from "../components/ManagePayeesModal";
import { usePayees } from "../hooks/usePayees";
import AddTransactionModal from "../components/AddTransactionModal";
import EditTransactionModal from "../components/EditTransactionModal";
import TransactionViewModal from "../components/TransactionsViewModal";
import styles from "./css/TransactionPage.module.css";
import { saveWithoutWaiting } from "../../../shared/utils/saveWithoutWaiting";
import { PageShell } from "../../../shared/components/PageShell";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { isDebtTransfer } from "../../../shared/utils/moneyModel";
import { findCategory } from "../../../shared/utils/categories";

const PAGE_SIZE = 15;

// ─── Tinted chips ─────────────────────────────────────────────────────────────
// Built from the semantic tokens rather than fixed pastels, so the fill and text
// both track the active theme (light pastel on white, muted glow on dark).

const tinted = (token: string, strength = 16): React.CSSProperties => ({
  background: `color-mix(in srgb, var(${token}) ${strength}%, transparent)`,
  color: `var(${token})`,
});

function getInvestmentBadgeStyle(contributionType: string | undefined): React.CSSProperties {
  return { fontSize: 10, border: "none", ...tinted(contributionType === "withdrawal" ? "--color-invest" : "--bs-primary") };
}

function getGoalBadgeStyle(contributionType: string | undefined): React.CSSProperties {
  return { fontSize: 10, border: "none", ...tinted("--color-goal", contributionType === "withdrawal" ? 22 : 14) };
}

function getAmountChipStyle(tx: Transaction): React.CSSProperties {
  if (tx.isGoalTransaction) return tinted("--color-goal");
  if (tx.isInvestmentTransaction) return tinted("--color-invest");
  return tinted(tx.type === "income" ? "--color-income" : "--color-expense");
}

// ─── Filter summary ───────────────────────────────────────────────────────────
// Answers "how much have I spent on Food this period?" for whatever filter is
// currently applied. Deposits into goals/investments are excluded from the
// spent/earned figures (they are transfers, not spending); withdrawals count as
// money coming back in, matching the Overview's model.

interface FilterTotals {
  earned: number;
  spent: number;
  net: number;
  count: number;
}

function computeFilterTotals(transactions: Transaction[]): FilterTotals {
  let earned = 0;
  let spent = 0;

  for (const tx of transactions) {
    if (tx.isInvestmentTransaction) {
      if (tx.contributionType === "withdrawal") earned += tx.amount;
      continue;
    }
    // A loan moved a card; it did not come in or go out.
    if (isDebtTransfer(tx)) continue;
    if (tx.type === "income") earned += tx.amount;
    else spent += Math.abs(tx.amount);
  }

  return { earned, spent, net: earned - spent, count: transactions.length };
}

function FilterSummary({ transactions, formatCurrency }: { transactions: Transaction[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const { earned, spent, net, count } = useMemo(() => computeFilterTotals(transactions), [transactions]);

  if (count === 0) return null;

  return (
    <div className={styles.summaryBar}>
      {spent > 0 && (
        <span className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t("transactions.totalSpent")}</span>
          <span className={styles.summaryValue} style={{ color: "var(--color-expense)" }}>
            {formatCurrency(spent)}
          </span>
        </span>
      )}

      {earned > 0 && (
        <span className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t("transactions.totalEarned")}</span>
          <span className={styles.summaryValue} style={{ color: "var(--color-income)" }}>
            {formatCurrency(earned)}
          </span>
        </span>
      )}

      {/* Net only adds information when both sides are present */}
      {spent > 0 && earned > 0 && (
        <span className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t("transactions.net")}</span>
          <span className={styles.summaryValue} style={{ color: net >= 0 ? "var(--color-income)" : "var(--color-expense)" }}>
            {net >= 0 ? "+" : ""}
            {formatCurrency(net)}
          </span>
        </span>
      )}

      <span className={styles.summaryCount}>{t("transactions.transactionCount", { count })}</span>
    </div>
  );
}

function resolveCategory(tx: Transaction, categories: Category[]): Category | undefined {
  if (tx.isGoalTransaction) {
    return { id: "__goal__", name: "Goal", icon: "🎯", type: "expense", isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() } as Category;
  }
  if (tx.isInvestmentTransaction) return categories.find((c) => c.name === "Investments");
  return findCategory(categories, tx.categoryId) as Category | undefined;
}


function CategorySelect({ value, onChange, categories, size }: { value: string; onChange: (v: string) => void; categories: Category[]; size?: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: size === "sm" ? 31 : 38,
          fontSize: size === "sm" ? 13 : 14,
          paddingLeft: 10,
          paddingRight: 32,
          border: "1px solid var(--color-border-primary)",
          borderRadius: 4,
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          cursor: "pointer",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
        }}
      >
        <option value="all">{t("transactions.allCategories")}</option>
        <option value="income">💰 {t("transactions.income")}</option>
        <option value="expense">💸 {t("transactions.expense")}</option>
        <optgroup label={t("transactions.categories")}>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {categoryLabel(c.name, t)}
            </option>
          ))}
        </optgroup>
      </select>
      {value !== "all" ? (
        <button
          onClick={() => onChange("all")}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
            zIndex: 2,
          }}
          title={t("transactions.clearFilter")}
        >
          x
        </button>
      ) : (
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--color-text-secondary)", fontSize: 11 }}>▾</span>
      )}
    </div>
  );
}

function DeleteConfirmModal({ transaction, isDeleting, onConfirm, onClose }: { transaction: Transaction; isDeleting: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");

  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>{t("transactions.deleteTransaction")}</ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 14, margin: 0 }}>
          {t("transactions.deleteConfirm", { defaultValue: "Are you sure you want to delete {{name}}?", name: transaction.description })}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{t("transactions.deleteUndoneWarning", { defaultValue: "This cannot be undone." })}</p>
        {deleteGuard.locked && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{deleteGuard.reason}</p>}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={isDeleting || deleteGuard.locked}>
          {isDeleting ? t("common.deleting") : t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * One record on the phone: its icon, name and category, and its amount — a
 * card to tap, which opens it with its Edit and Delete. Two buttons on every
 * row took a third of its width from the name and made a list of fifteen a
 * column of thirty buttons.
 */
function TransactionCard({ tx, categories, formatCurrency, onView }: { tx: Transaction; categories: Category[]; formatCurrency: (n: number) => string; onView: () => void }) {
  const { t } = useTranslation();
  const cat = resolveCategory(tx, categories);
  const isInvestment = !!tx.isInvestmentTransaction;
  const isPositive = tx.isGoalTransaction ? tx.contributionType === "withdrawal" : isInvestment ? tx.contributionType === "withdrawal" : tx.type === "income";
  // A tag only where it says more than the amount's sign and colour already
  // do: money into or out of a goal or an investment.
  const kind =
    tx.isGoalTransaction || isInvestment
      ? { label: tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit"), style: tx.isGoalTransaction ? getGoalBadgeStyle(tx.contributionType) : getInvestmentBadgeStyle(tx.contributionType) }
      : undefined;

  return (
    <button type="button" className={styles.txCard} onClick={onView}>
      <span className={styles.txIcon} style={{ background: isPositive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }} aria-hidden>
        {cat?.icon ?? "💳"}
      </span>
      <span className={styles.txBody}>
        <span className={styles.txName}>{tx.description}</span>
        <span className={styles.txMeta}>
          {kind && (
            <span className={styles.txKind} style={kind.style}>
              {kind.label}
            </span>
          )}
          <span className="text-truncate">{categoryLabel(cat?.name, t) || "—"}</span>
        </span>
      </span>
      <span className={styles.txAmount} style={{ color: isPositive ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
        {isPositive ? "+" : "−"}
        {formatCurrency(tx.amount)}
      </span>
    </button>
  );
}

/** What the filter holds, at the top of the phone's page: out and in, then the net and how many. */
function MobileSummary({ transactions, formatCurrency }: { transactions: Transaction[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const { earned, spent, net, count } = useMemo(() => computeFilterTotals(transactions), [transactions]);
  return (
    <div className="mb-3">
      <div className={styles.sumBoxes}>
        <div className={styles.sumBox}>
          <span className={styles.sumLabel}>{t("transactions.totalSpent")}</span>
          <span className={styles.sumValue} style={{ color: "var(--color-expense-text)" }}>
            {formatCurrency(spent)}
          </span>
        </div>
        <div className={styles.sumBox}>
          <span className={styles.sumLabel}>{t("transactions.totalEarned")}</span>
          <span className={styles.sumValue} style={{ color: "var(--color-income-text)" }}>
            {formatCurrency(earned)}
          </span>
        </div>
      </div>
      <div className={styles.sumLine}>
        <span>
          {t("transactions.net")}{" "}
          <b style={{ color: net > 0 ? "var(--color-income-text)" : net < 0 ? "var(--color-expense-text)" : undefined }}>
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            {formatCurrency(Math.abs(net))}
          </b>
        </span>
        <span>{t("transactions.transactionCount", { count })}</span>
      </div>
    </div>
  );
}

/**
 * The page's records under the day they happened, newest first, each day with
 * what it came to — so "what did Saturday cost" is a heading, not a sum.
 */
function DayGroups({ transactions, categories, formatCurrency, onView }: { transactions: Transaction[]; categories: Category[]; formatCurrency: (n: number) => string; onView: (tx: Transaction) => void }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short" }), [lang]);
  const dayLabel = (date: Date) => `${weekdayFmt.format(date)} ${formatTable(date, lang)}`;
  const days = useMemo(() => {
    const groups: { key: string; date: Date; rows: Transaction[] }[] = [];
    for (const tx of transactions) {
      const date = firestoreToDate(tx.date);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(tx);
      else groups.push({ key, date, rows: [tx] });
    }
    return groups;
  }, [transactions]);

  return (
    <>
      {days.map((day) => {
        const { net } = computeFilterTotals(day.rows);
        return (
          <section key={day.key} className={styles.dayGroup} aria-label={dayLabel(day.date)}>
            <div className={styles.dayHead}>
              <span className={styles.dayName}>
                <span className={styles.dayWeekday}>{weekdayFmt.format(day.date)}</span> {formatTable(day.date, lang)}
              </span>
              <span style={{ color: net > 0 ? "var(--color-income-text)" : net < 0 ? "var(--color-expense-text)" : undefined }}>
                {net > 0 ? "+" : net < 0 ? "−" : ""}
                {formatCurrency(Math.abs(net))}
              </span>
            </div>
            <div className={styles.dayCards}>
              {day.rows.map((tx) => (
                <TransactionCard key={tx.id} tx={tx} categories={categories} formatCurrency={formatCurrency} onView={() => onView(tx)} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderTop: "1px solid var(--color-border-tertiary)",
        fontSize: 13,
        color: "var(--color-text-secondary)",
        flex: "0 0 auto",
      }}
    >
      <span>{t("transactions.paginationRange", { from, to, total: totalItems })}</span>
      <div style={{ display: "flex", gap: 4 }}>
        <Button size="sm" color="light" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} style={{ padding: "2px 10px", fontSize: 13 }}>
          {t("common.prev")}
        </Button>
        <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {currentPage} / {totalPages}
        </span>
        <Button size="sm" color="light" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} style={{ padding: "2px 10px", fontSize: 13 }}>
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  // Seeded from the URL so a category clicked on the Analytics screen arrives
  // here already applied, rather than dumping the reader into an unfiltered list.
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get("category") ?? "all");
  const [fromDate, setFromDate] = useState<Date | null>(new Date(new Date().getFullYear(), 0, 1));
  const [toDate, setToDate] = useState<Date | null>(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayeesModal, setShowPayeesModal] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [deleteTransaction, setDeleteTransaction] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  // A new page of records starts at the top of the page, not where the last
  // one was left: "Next" at the foot of fifteen cards used to open the next
  // fifteen at their foot. The page scrolls in the layout's `.page-content`.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    const scroller = document.querySelector(".page-content");
    if (scroller) scroller.scrollTop = 0;
  }, [currentPage]);

  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useTransactions();
  const { data: categories = [], isLoading: catLoading, isError: catError } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();
  const { payees, isReady: payeesReady, add: addPayee, rename: renamePayee, remove: removePayee } = usePayees();

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  // The dialog closes on the optimistic row, not on the server's answer — see
  // `saveWithoutWaiting`. A rejection arrives as a toast instead.
  const handleCreate = (data: CreateTransactionDTO): Promise<void> =>
    saveWithoutWaiting(createMutation, data, () => toast.error(t("transactions.saveFailed")));

  const handleUpdate = (transactionId: string, data: UpdateTransactionDTO): Promise<void> =>
    saveWithoutWaiting(updateMutation, { transactionId, data }, () => toast.error(t("transactions.updateFailed")));

  const handleDelete = () => {
    if (!deleteTransaction) return;
    // The whole row, not just its id: a bill's expense takes its payment with it.
    deleteMutation.mutate(deleteTransaction, {
      onSuccess: () => {
        toast.success(t("transactions.deleteSuccess"));
        setDeleteTransaction(null);
      },
      onError: () => toast.error(t("transactions.deleteFailed")),
    });
  };

  // These only move the filter — resetting to page 1 is handled centrally below.
  // The first tap on a day starts a range, the second ends it — see `tapDay`.
  // Held here so a range set any other way forgets a half-picked one.
  const [dayAnchor, setDayAnchor] = useState<Date | null>(null);
  const handleDaySelect = useCallback(
    (date: Date) => {
      const next = tapDay(dayAnchor, date);
      setFromDate(next.range.from);
      setToDate(next.range.to);
      setDayAnchor(next.anchor);
    },
    [dayAnchor],
  );

  const handleFromChange = useCallback(
    (d: Date | null) => {
      setDayAnchor(null);
      setFromDate(d);
      if (d && toDate && midnight(d) > midnight(toDate)) setToDate(null);
    },
    [toDate],
  );

  const handleToChange = useCallback(
    (d: Date | null) => {
      if (d && fromDate && midnight(d) < midnight(fromDate)) return;
      setDayAnchor(null);
      setToDate(d);
    },
    [fromDate],
  );

  const uniqueCategoriesByName = useMemo(() => {
    const seen = new Set<string>();
    return [...categories]
      .filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const transactionsWithDates = useMemo(() => transactions.map((tx) => ({ tx, date: firestoreToDate(tx.date), createdAt: firestoreToDate(tx.createdAt) })), [transactions]);

  const filteredTransactions = useMemo(() => {
    const fromMid = fromDate ? midnight(fromDate) : null;
    const toMid = toDate ? midnight(toDate) : null;
    const query = debouncedSearch.toLowerCase();
    return transactionsWithDates
      .filter(({ tx, date }) => {
        const matchSearch = tx.description.toLowerCase().includes(query);
        const matchCat =
          selectedCategory === "all" ||
          (selectedCategory === "income" && tx.type === "income") ||
          (selectedCategory === "expense" && tx.type === "expense") ||
          (tx.isInvestmentTransaction ? selectedCategory === "Investments" : categories.filter((c) => c.name === selectedCategory).some((c) => c.id === tx.categoryId));
        const txMid = midnight(date);
        let matchDate = true;
        if (fromMid !== null && toMid !== null) matchDate = txMid >= fromMid && txMid <= toMid;
        else if (fromMid !== null) matchDate = txMid >= fromMid;
        else if (toMid !== null) matchDate = txMid <= toMid;
        return matchSearch && matchCat && matchDate;
      })
      .sort((a, b) => {
        const d = b.date.getTime() - a.date.getTime();
        if (d !== 0) return d;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .map(({ tx }) => tx);
  }, [transactionsWithDates, debouncedSearch, selectedCategory, fromDate, toDate, categories]);

  // Whenever the active filter changes, jump back to page 1. Adjusting state
  // during render (rather than in an effect) avoids the extra render pass React
  // would otherwise have to throw away — see react.dev "You Might Not Need an
  // Effect". This is the single place that resets the page, so the individual
  // filter handlers don't have to remember to.
  const filterSignature = `${debouncedSearch}|${selectedCategory}|${fromDate?.getTime() ?? ""}|${toDate?.getTime() ?? ""}`;
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature);
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, currentPage]);

  const isLoading = txLoading || catLoading;

  // How tall the held dates are, so each day's heading holds just under them
  // — the card changes height with the screen and the language.
  const datesRef = useRef<HTMLDivElement>(null);
  const [datesHeight, setDatesHeight] = useState(0);
  useEffect(() => {
    const el = datesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setDatesHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
    // The card exists once the records have loaded; that is when to watch it.
  }, [isLoading]);
  const isError = txError || catError;

  const calendarProps = {
    allTransactions: transactions,
    fromDate,
    toDate,
    onFromChange: handleFromChange,
    onToChange: handleToChange,
    onDaySelect: handleDaySelect,
  };
  // Both ends at once: set one after the other, the second was checked against
  // the first's old value, and stepping back a month refused its own end.
  const handleRangeChange = useCallback((range: { from: Date | null; to: Date | null }) => {
    setDayAnchor(null);
    setFromDate(range.from);
    setToDate(range.to);
  }, []);

  return (
    <PageShell>
      {/* ── Desktop ── */}
      <div className="d-none d-lg-block">
        <Row className="g-4">
          <Col lg={4}>
            {isLoading ? (
              <SkeletonCard>
                <SkeletonHeading />
                <Skeleton height={230} style={{ borderRadius: "var(--border-radius-md)" }} />
              </SkeletonCard>
            ) : (
              <TransactionCalendar {...calendarProps} />
            )}
          </Col>
          <Col lg={8}>
            {isError && (
              <Alert color="danger" className="mb-3">
                {t("transactions.loadFailed")}
              </Alert>
            )}
            <Card className="border-0 shadow-sm mb-3">
              <CardBody className="py-2">
                {/* Flex rather than a 12-column grid: fixed column widths crushed
                    the two buttons into each other. The actions size to their own
                    content and never shrink; the fields wrap to a second line when
                    the row runs out of room. */}
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <div style={{ flex: "2 1 180px", minWidth: 0 }}>
                    <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t("transactions.searchPlaceholder")} size="sm" block />
                  </div>
                  <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                    <CategorySelect
                      value={selectedCategory}
                      onChange={setSelectedCategory}
                      categories={uniqueCategoriesByName}
                      size="sm"
                    />
                  </div>
                  <div className="d-flex gap-2 ms-auto flex-shrink-0">
                    <Button
                      color="secondary"
                      outline
                      size="sm"
                      className="flex-shrink-0"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => setShowPayeesModal(true)}
                      disabled={!payeesReady}
                      title={t("transactions.managePayees")}
                      aria-label={t("transactions.managePayees")}
                    >
                      <FiUsers size={14} />
                      {/* Label only where there's room for it */}
                      <span className="d-none d-xl-inline ms-1">{t("transactions.payees")}</span>
                    </Button>
                    <Button color="primary" size="sm" className="flex-shrink-0" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAddModal(true)}>
                      + {t("transactions.addTransactionBtn")}
                    </Button>
                  </div>
                </div>

                {/* Totals for the active filter — e.g. how much on Food this month */}
                {!isLoading && (
                  <div className="mt-2">
                    <FilterSummary transactions={filteredTransactions} formatCurrency={formatCurrency} />
                  </div>
                )}
              </CardBody>
            </Card>


            <Card className="border-0 shadow-sm">
              <CardBody className="p-0">
                {isLoading ? (
                  <SkeletonTable columns={5} rows={8} alignEnd={[3, 4]} />
                ) : (
                  <div className={styles.tableScroll}>
                    <Table hover className="mb-0">
                      <thead>
                        <tr>
                          <th className="ps-3" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            {localeUpperCase(t("common.date"), i18n.resolvedLanguage)}
                          </th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>{localeUpperCase(t("transactions.payee"), i18n.resolvedLanguage)}</th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>{localeUpperCase(t("common.category"), i18n.resolvedLanguage)}</th>
                          <th className="text-end" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            {localeUpperCase(t("common.amount"), i18n.resolvedLanguage)}
                          </th>
                          <th className="text-end pe-3" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            {localeUpperCase(t("common.actions"), i18n.resolvedLanguage)}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-muted py-5">
                              {t("transactions.noneFound")}
                            </td>
                          </tr>
                        ) : (
                          pagedTransactions.map((tx) => {
                            const cat = resolveCategory(tx, categories);
                            const isPositive = tx.isGoalTransaction
                              ? tx.contributionType === "withdrawal"
                              : tx.isInvestmentTransaction
                                ? tx.contributionType === "withdrawal"
                                : tx.type === "income";
                            const chipStyle = getAmountChipStyle(tx);
                            return (
                              <tr key={tx.id} style={{ cursor: "pointer" }} onClick={() => setViewTransaction(tx)}>
                                <td className="ps-3" style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                                  {formatTable(firestoreToDate(tx.date), i18n.resolvedLanguage ?? "en")}
                                </td>
                                <td style={{ fontWeight: 500 }}>{tx.description}</td>
                                <td>
                                  <Badge color="light" className="text-dark">
                                    {cat?.icon} {categoryLabel(cat?.name, t) || "—"}
                                  </Badge>
                                </td>
                                <td className="text-end">
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "3px 10px",
                                      borderRadius: 20,
                                      fontSize: 13,
                                      fontWeight: 500,
                                      background: chipStyle.background,
                                      color: chipStyle.color,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {isPositive ? "+" : "−"}
                                    {formatCurrency(tx.amount)}
                                  </span>
                                </td>
                                <td className="text-end pe-3">
                                  <div className="d-flex justify-content-end gap-2 align-items-center" onClick={(e) => e.stopPropagation()}>
                                    {!tx.isInvestmentTransaction && !tx.isGoalTransaction && (
                                      <span
                                        style={{
                                          display: "inline-block",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontWeight: 600,
                                          fontSize: 10,
                                          background: `color-mix(in srgb, var(${tx.type === "income" ? "--color-income" : "--color-expense"}) 16%, transparent)`,
                                          color: tx.type === "income" ? "var(--color-income)" : "var(--color-expense)",
                                        }}
                                      >
                                        {isDebtTransfer(tx) ? t("transactions.loanMove") : tx.type === "income" ? t("transactions.income") : t("transactions.expense")}
                                      </span>
                                    )}
                                    {tx.isGoalTransaction && (
                                      <span
                                        style={{
                                          ...getGoalBadgeStyle(tx.contributionType),
                                          display: "inline-block",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontWeight: 600,
                                          fontSize: 10,
                                        }}
                                      >
                                        {tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit")}
                                      </span>
                                    )}
                                    {tx.isInvestmentTransaction && !tx.isGoalTransaction && (
                                      <span
                                        style={{
                                          ...getInvestmentBadgeStyle(tx.contributionType),
                                          display: "inline-block",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontWeight: 600,
                                          fontSize: 10,
                                        }}
                                      >
                                        {tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit")}
                                      </span>
                                    )}
                                    <Button
                                      size="sm"
                                      color="light"
                                      disabled={tx.isInvestmentTransaction || tx.isGoalTransaction || !!tx.debtId}
                                      style={{
                                        padding: "2px 8px",
                                        opacity: tx.isInvestmentTransaction || tx.isGoalTransaction || tx.debtId ? 0.35 : 1,
                                        cursor: tx.isInvestmentTransaction || tx.isGoalTransaction || tx.debtId ? "not-allowed" : "pointer",
                                      }}
                                      onClick={() => {
                                        if (!tx.isInvestmentTransaction && !tx.isGoalTransaction && !tx.debtId) setEditTransaction(tx);
                                      }}
                                      title={t("common.edit")}
                                    >
                                      <FiEdit2 size={13} />
                                    </Button>
                                    <DeleteButton opensConfirm iconOnly size="sm" disabled={tx.isInvestmentTransaction || tx.isGoalTransaction || !!tx.debtId} onClick={() => setDeleteTransaction(tx)} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </CardBody>
              <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredTransactions.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
            </Card>
          </Col>
        </Row>
      </div>

      {/* ── Mobile ── */}
      {/* ── Mobile ── One scroll, the page's own. What the filter holds
          first, then the dates, the search, and the records by day. */}
      <div className="d-lg-none" style={{ ["--dates-height" as string]: `${datesHeight}px` }}>
        {isError && (
          <Alert color="danger" className="mb-3">
            {t("transactions.loadFailed")}
          </Alert>
        )}
        {!isLoading && <MobileSummary transactions={filteredTransactions} formatCurrency={formatCurrency} />}
        {isLoading ? (
          <SkeletonCard>
            <SkeletonHeading />
            <Skeleton height={120} style={{ borderRadius: "var(--border-radius-md)" }} />
          </SkeletonCard>
        ) : (
          // Held at the top while the days scroll under it: which dates are on
          // screen is the one thing worth seeing from anywhere in the list.
          <div ref={datesRef} className={styles.stickyDates}>
            <MobileCalendar {...calendarProps} onRangeChange={handleRangeChange} />
          </div>
        )}
        <div className="d-flex gap-2 align-items-center mb-2">
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t("transactions.searchShort")} block />
          </div>
          <Button color="primary" className="flex-shrink-0" onClick={() => setShowAddModal(true)} aria-label={t("transactions.addTransaction")}>
            +
          </Button>
        </div>
        <div className="d-flex gap-2 align-items-center mb-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <CategorySelect value={selectedCategory} onChange={setSelectedCategory} categories={uniqueCategoriesByName} />
          </div>
          <Button
            color="secondary"
            outline
            className="flex-shrink-0"
            onClick={() => setShowPayeesModal(true)}
            disabled={!payeesReady}
            aria-label={t("transactions.managePayees")}
            title={t("transactions.managePayees")}
          >
            <FiUsers size={15} />
          </Button>
        </div>

        {isLoading ? (
          <SkeletonRows count={8} />
        ) : pagedTransactions.length === 0 ? (
          <p className="text-center text-muted py-5 mb-0">{t("transactions.noneFound")}</p>
        ) : (
          <DayGroups transactions={pagedTransactions} categories={categories} formatCurrency={formatCurrency} onView={setViewTransaction} />
        )}
        <Card className="border-0 shadow-sm mt-3">
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredTransactions.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        </Card>
      </div>

      {showPayeesModal && (
        <ManagePayeesModal payees={payees} onClose={() => setShowPayeesModal(false)} onAdd={addPayee} onRename={renamePayee} onRemove={removePayee} />
      )}

      <AddTransactionModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} categories={categories} onSubmit={handleCreate} />
      {editTransaction && <EditTransactionModal transaction={editTransaction} isOpen onClose={() => setEditTransaction(null)} categories={categories} onSubmit={handleUpdate} />}
      {deleteTransaction && (
        <DeleteConfirmModal transaction={deleteTransaction} isDeleting={deleteMutation.isPending} onConfirm={handleDelete} onClose={() => setDeleteTransaction(null)} />
      )}
      {viewTransaction && (
        <TransactionViewModal
          transaction={viewTransaction}
          categories={categories}
          formatCurrency={formatCurrency}
          onClose={() => setViewTransaction(null)}
          // Handed on, not stacked: the record's own sheet gives way to the editor or the "are you sure".
          onEdit={() => {
            setEditTransaction(viewTransaction);
            setViewTransaction(null);
          }}
          onDelete={() => {
            setDeleteTransaction(viewTransaction);
            setViewTransaction(null);
          }}
        />
      )}
    </PageShell>
  );
}
