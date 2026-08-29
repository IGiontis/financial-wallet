import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  Table,
  Badge,
  Button,
  Spinner,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import { FiEdit2, FiTrash2, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { useTransactions, useCategories, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from "../hooks/useTransactions";
import { useTranslation } from "react-i18next";
import { SearchInput } from "../../../shared/components/SearchInput";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import type { CreateTransactionDTO, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { firestoreToDate } from "../../../shared/utils/dates";
import { isSameDay, midnight, formatTable } from "../transactionDates";
import { TransactionCalendar, MobileCalendar } from "../components/TransactionCalendar";
import ManagePayeesModal from "../components/ManagePayeesModal";
import { usePayees } from "../hooks/usePayees";
import AddTransactionModal from "../components/AddTransactionModal";
import EditTransactionModal from "../components/EditTransactionModal";
import TransactionViewModal from "../components/TransactionsViewModal";
import styles from "./css/TransactionPage.module.css";

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
  return categories.find((c) => c.id === tx.categoryId);
}


function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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
  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>{t("transactions.deleteTransaction")}</ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 14, margin: 0 }}>
          {t("transactions.deleteConfirm", { defaultValue: "Are you sure you want to delete {{name}}?", name: transaction.description })}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>{t("transactions.deleteUndoneWarning", { defaultValue: "This cannot be undone." })}</p>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? t("common.deleting") : t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function TransactionCard({
  tx,
  categories,
  formatCurrency,
  onEdit,
  onDelete,
  onView,
}: {
  tx: Transaction;
  categories: Category[];
  formatCurrency: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cat = resolveCategory(tx, categories);
  const isInvestment = !!tx.isInvestmentTransaction;
  const isPositive = tx.isGoalTransaction ? tx.contributionType === "withdrawal" : isInvestment ? tx.contributionType === "withdrawal" : tx.type === "income";
  const chipStyle = getAmountChipStyle(tx);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          flexShrink: 0,
          background: isPositive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {cat?.icon ?? "💳"}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onView}>
        <p style={{ fontWeight: 500, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
          {categoryLabel(cat?.name, t) || "—"} · <span style={{ whiteSpace: "nowrap" }}>{formatTable(firestoreToDate(tx.date), i18n.resolvedLanguage ?? "en")}</span>
        </p>
        {tx.isGoalTransaction && (
          <span style={{ ...getGoalBadgeStyle(tx.contributionType), display: "inline-block", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10, marginTop: 2 }}>
            {tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit")}
          </span>
        )}
        {isInvestment && !tx.isGoalTransaction && (
          <span
            style={{ ...getInvestmentBadgeStyle(tx.contributionType), display: "inline-block", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10, marginTop: 2 }}
          >
            {tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit")}
          </span>
        )}
        {!isInvestment && !tx.isGoalTransaction && (
          <span
            style={{
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: 10,
              marginTop: 2,
              background: `color-mix(in srgb, var(${tx.type === "income" ? "--color-income" : "--color-expense"}) 16%, transparent)`,
              color: tx.type === "income" ? "var(--color-income)" : "var(--color-expense)",
            }}
          >
            {tx.type === "income" ? t("transactions.income") : t("transactions.expense")}
          </span>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
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
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <Button
          size="sm"
          color="light"
          disabled={isInvestment || tx.isGoalTransaction}
          style={{ padding: "4px 8px", opacity: isInvestment || tx.isGoalTransaction ? 0.35 : 1, cursor: isInvestment || tx.isGoalTransaction ? "not-allowed" : "pointer" }}
          onClick={() => {
            if (!isInvestment && !tx.isGoalTransaction) onEdit();
          }}
        >
          <FiEdit2 size={13} />
        </Button>
        <Button size="sm" color="light" style={{ padding: "4px 8px", color: "var(--bs-danger)" }} onClick={onDelete}>
          <FiTrash2 size={13} />
        </Button>
      </div>
    </div>
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
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useTransactions();
  const { data: categories = [], isLoading: catLoading, isError: catError } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();
  const { payees, isReady: payeesReady, add: addPayee, rename: renamePayee, remove: removePayee } = usePayees();

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  const handleCreate = (data: CreateTransactionDTO): Promise<void> =>
    new Promise((resolve, reject) => {
      createMutation.mutate(data, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleUpdate = (transactionId: string, data: UpdateTransactionDTO): Promise<void> =>
    new Promise((resolve, reject) => {
      updateMutation.mutate({ transactionId, data }, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleDelete = () => {
    if (!deleteTransaction) return;
    deleteMutation.mutate(deleteTransaction.id, {
      onSuccess: () => {
        toast.success(t("transactions.deleteSuccess"));
        setDeleteTransaction(null);
      },
      onError: () => toast.error(t("transactions.deleteFailed")),
    });
  };

  // These only move the filter — resetting to page 1 is handled centrally below.
  const handleDaySelect = useCallback(
    (date: Date) => {
      if (isSameDay(date, fromDate) && isSameDay(date, toDate)) {
        setFromDate(null);
        setToDate(null);
      } else {
        setFromDate(date);
        setToDate(date);
      }
    },
    [fromDate, toDate],
  );

  const handleFromChange = useCallback(
    (d: Date | null) => {
      setFromDate(d);
      if (d && toDate && midnight(d) > midnight(toDate)) setToDate(null);
    },
    [toDate],
  );

  const handleToChange = useCallback(
    (d: Date | null) => {
      if (d && fromDate && midnight(d) < midnight(fromDate)) return;
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
  const isError = txError || catError;

  const calendarProps = {
    allTransactions: transactions,
    fromDate,
    toDate,
    onFromChange: handleFromChange,
    onToChange: handleToChange,
    onDaySelect: handleDaySelect,
  };

  return (
    <Container fluid className="py-2">
      {/* ── Desktop ── */}
      <div className="d-none d-lg-block">
        <Row className="g-4">
          <Col lg={4}>
            {isLoading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
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
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                  </div>
                ) : (
                  <div className={styles.tableScroll}>
                    <Table hover className="mb-0">
                      <thead>
                        <tr>
                          <th className="ps-3" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            {t("common.date").toUpperCase()}
                          </th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("transactions.payee").toUpperCase()}</th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("common.category").toUpperCase()}</th>
                          <th className="text-end" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            {t("common.amount").toUpperCase()}
                          </th>
                          <th className="text-end pe-3" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                            ACTIONS
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-muted py-5">
                              No transactions found
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
                                        {tx.type === "income" ? t("transactions.income") : t("transactions.expense")}
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
                                      disabled={tx.isInvestmentTransaction || tx.isGoalTransaction}
                                      style={{
                                        padding: "2px 8px",
                                        opacity: tx.isInvestmentTransaction || tx.isGoalTransaction ? 0.35 : 1,
                                        cursor: tx.isInvestmentTransaction || tx.isGoalTransaction ? "not-allowed" : "pointer",
                                      }}
                                      onClick={() => {
                                        if (!tx.isInvestmentTransaction && !tx.isGoalTransaction) setEditTransaction(tx);
                                      }}
                                      title={t("common.edit")}
                                    >
                                      <FiEdit2 size={13} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      color="light"
                                      style={{ padding: "2px 8px", color: "var(--bs-danger)" }}
                                      onClick={() => setDeleteTransaction(tx)}
                                      title={t("common.delete")}
                                    >
                                      <FiTrash2 size={13} />
                                    </Button>
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
      <div className={`d-lg-none ${styles.mobileShell}`}>
        {isError && (
          <Alert color="danger" className="mb-3" style={{ flexShrink: 0 }}>
            {t("transactions.loadFailed")}
          </Alert>
        )}
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
          </div>
        ) : (
          <MobileCalendar {...calendarProps} />
        )}
        {/* Search gets its own line: at 375px it was sharing a row with a
            select and two buttons, which left every one of them too narrow to
            read or hit comfortably. */}
        <div className="mb-2" style={{ flexShrink: 0 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t("transactions.searchShort")} size="sm" block />
        </div>
        <div className="d-flex gap-2 align-items-center mb-2" style={{ flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CategorySelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              categories={uniqueCategoriesByName}
              size="sm"
            />
          </div>
          <Button
            color="secondary"
            outline
            size="sm"
            style={{ flexShrink: 0 }}
            onClick={() => setShowPayeesModal(true)}
            disabled={!payeesReady}
            aria-label={t("transactions.managePayees")}
            title={t("transactions.managePayees")}
          >
            <FiUsers size={14} />
          </Button>
          <Button color="primary" size="sm" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setShowAddModal(true)}>
            +
          </Button>
        </div>

        {/* Totals for the active filter */}
        {!isLoading && (
          <div className="mb-2" style={{ flexShrink: 0 }}>
            <FilterSummary transactions={filteredTransactions} formatCurrency={formatCurrency} />
          </div>
        )}

        <Card className="border-0 shadow-sm" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <CardBody className={`p-0 ${styles.mobileScroll}`}>
            {isLoading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : pagedTransactions.length === 0 ? (
              <p className="text-center text-muted py-5 mb-0">{t("transactions.noneFound")}</p>
            ) : (
              pagedTransactions.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  formatCurrency={formatCurrency}
                  onEdit={() => setEditTransaction(tx)}
                  onDelete={() => setDeleteTransaction(tx)}
                  onView={() => setViewTransaction(tx)}
                />
              ))
            )}
          </CardBody>
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
      {viewTransaction && <TransactionViewModal transaction={viewTransaction} categories={categories} formatCurrency={formatCurrency} onClose={() => setViewTransaction(null)} />}
    </Container>
  );
}
