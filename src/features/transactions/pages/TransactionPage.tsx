import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  Input,
  Table,
  Badge,
  InputGroup,
  InputGroupText,
  Button,
  Spinner,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { useTransactions, useCategories, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from "../hooks/useTransactions";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import type { CreateTransactionDTO, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";
import AddTransactionModal from "../components/AddTransactionModal";
import EditTransactionModal from "../components/EditTransactionModal";

// ============================================================
// CONSTANTS
// ============================================================

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const PAGE_SIZE = 15;

// ============================================================
// COLOR HELPERS
// ============================================================

function getAmountColor(tx: Transaction): string {
  if (tx.isInvestmentTransaction) {
    return tx.contributionType === "withdrawal" ? "#75678e" : "#1D4ED8";
  }
  return tx.type === "income" ? "#10B981" : "#EF4444";
}

function getInvestmentBadgeStyle(contributionType: string | undefined): React.CSSProperties {
  return {
    fontSize: 10,
    background: contributionType === "withdrawal" ? "#75678e" : "#1D4ED8",
    color: "#ffffff",
    border: "none",
  };
}

// ============================================================
// CATEGORY HELPERS
// ============================================================

function resolveCategory(tx: Transaction, categories: Category[]): Category | undefined {
  if (tx.isInvestmentTransaction) {
    return categories.find((c) => c.name === "Investments");
  }
  return categories.find((c) => c.id === tx.categoryId);
}

// ============================================================
// HELPERS
// ============================================================

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toInputValue(d: Date | null): string {
  return d ? toDateKey(d) : "";
}

function fromInputValue(v: string): Date | null {
  if (!v) return null;
  const [y, m, day] = v.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTable(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

// ============================================================
// CUSTOM HOOK — DEBOUNCE
// ============================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ============================================================
// DATE FIELD
// ============================================================

function DateField({ label, date, onChange, min, max }: { label: string; date: Date | null; onChange: (d: Date | null) => void; min?: string; max?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.showPicker()}
      style={{
        flex: 1,
        border: "1px solid rgba(0,0,0,0.13)",
        borderRadius: 8,
        padding: "7px 10px",
        position: "relative",
        background: "#fafafa",
        minWidth: 0,
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: date ? "#1a1a2e" : "#ccc", fontWeight: date ? 500 : 400 }}>{date ? formatDisplay(date) : "Select date"}</div>
      <input
        ref={inputRef}
        type="date"
        value={toInputValue(date)}
        min={min}
        max={max}
        onChange={(e) => onChange(fromInputValue(e.target.value))}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
      />
      {date && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          style={{
            position: "absolute",
            top: "50%",
            right: 8,
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#bbb",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
            zIndex: 1,
          }}
        >
          x
        </button>
      )}
    </div>
  );
}

// ============================================================
// DAY PANEL
// ============================================================

function DayPanel({ date, transactions, categories, formatCurrency }: { date: Date; transactions: Transaction[]; categories: Category[]; formatCurrency: (n: number) => string }) {
  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", marginTop: 12, paddingTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 8 }}>{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      {transactions.length === 0 ? (
        <p style={{ fontSize: 13, color: "#bbb", margin: 0 }}>No transactions on this day.</p>
      ) : (
        transactions.map((tx) => {
          const cat = resolveCategory(tx, categories);
          const isPositive = tx.isInvestmentTransaction ? tx.contributionType === "withdrawal" : tx.type === "income";
          return (
            <div
              key={tx.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 0",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#888" }}>
                <span style={{ marginRight: 4 }}>{cat?.icon}</span>
                {tx.description}
              </span>
              <span style={{ fontWeight: 500, color: getAmountColor(tx) }}>
                {isPositive ? "+" : "−"}
                {formatCurrency(tx.amount)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// CALENDAR
// ============================================================

type CalView = "days" | "months" | "years";

function TransactionCalendar({
  allTransactions,
  categories,
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onDaySelect,
  formatCurrency,
}: {
  allTransactions: Transaction[];
  categories: Category[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
  formatCurrency: (n: number) => string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [calView, setCalView] = useState<CalView>("days");
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const txMap = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    allTransactions.forEach((tx) => {
      const k = toDateKey(firestoreToDate(tx.date));
      if (!map[k]) map[k] = [];
      map[k].push(tx);
    });
    return map;
  }, [allTransactions]);

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    setCalView("days");
    viewMonth === 0 ? (setViewMonth(11), setViewYear((y) => y - 1)) : setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setCalView("days");
    viewMonth === 11 ? (setViewMonth(0), setViewYear((y) => y + 1)) : setViewMonth((m) => m + 1);
  };

  const yearStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearStart + i);
  const activeDate = hoveredDate ?? fromDate ?? null;
  const activeTx = activeDate ? (txMap[toDateKey(activeDate)] ?? []) : [];
  const navBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    color: "#666",
    padding: "2px 8px",
    borderRadius: 6,
  };

  const pickerCell = (active: boolean, onClick: () => void, label: string) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        background: active ? "#1a1a2e" : "transparent",
        color: active ? "#fff" : "#333",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        padding: "8px 4px",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        width: "100%",
        textAlign: "center",
      }}
    >
      {label}
    </button>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardBody className="p-3">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <DateField label="FROM" date={fromDate} onChange={onFromChange} max={toInputValue(toDate) || undefined} />
          <DateField label="TO" date={toDate} onChange={onToChange} min={toInputValue(fromDate) || undefined} />
        </div>
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", marginBottom: 12 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button style={navBtn} onClick={prevMonth}>
            &lsaquo;
          </button>
          <button
            onClick={() => setCalView(calView === "days" ? "years" : "days")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              color: "#1a1a2e",
              borderRadius: 6,
              padding: "4px 8px",
              textDecoration: calView !== "days" ? "underline" : "none",
              textUnderlineOffset: 3,
            }}
          >
            {MONTH_NAMES[viewMonth]} {viewYear}
            <span style={{ fontSize: 10, marginLeft: 4, color: "#aaa" }}>v</span>
          </button>
          <button style={navBtn} onClick={nextMonth}>
            &rsaquo;
          </button>
        </div>

        {calView === "years" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
            {yearOptions.map((y) =>
              pickerCell(
                y === viewYear,
                () => {
                  setViewYear(y);
                  setCalView("months");
                },
                String(y),
              ),
            )}
          </div>
        )}
        {calView === "months" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 8 }}>
            {MONTH_SHORT.map((m, i) =>
              pickerCell(
                i === viewMonth,
                () => {
                  setViewMonth(i);
                  setCalView("days");
                },
                m,
              ),
            )}
          </div>
        )}
        {calView === "days" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
              {DAY_NAMES_SHORT.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#bbb", padding: "2px 0" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {cells.map((date, i) => {
                if (!date) return <div key={i} style={{ height: 38 }} />;
                const k = toDateKey(date);
                const dayTx = txMap[k] ?? [];
                const hasInc = dayTx.some((t) => t.type === "income" || (t.isInvestmentTransaction && t.contributionType === "deposit"));
                const hasExp = dayTx.some((t) => t.type === "expense" || (t.isInvestmentTransaction && t.contributionType === "withdrawal"));
                const isFrom = isSameDay(date, fromDate);
                const isTo = isSameDay(date, toDate);
                const isEdge = isFrom || isTo;
                const inRange = !!(fromDate && toDate && midnight(date) >= midnight(fromDate) && midnight(date) <= midnight(toDate) && !isEdge);
                const isHov = isSameDay(date, hoveredDate);
                const isToday = isSameDay(date, today);
                let bg = "transparent",
                  color = "#1a1a2e",
                  border = "none",
                  weight = 400;
                if (isEdge) {
                  bg = "#1a1a2e";
                  color = "#fff";
                  weight = 600;
                } else if (inRange) {
                  bg = "#e8eaf6";
                } else if (isHov) {
                  bg = "#f5f5f5";
                }
                if (isToday && !isEdge) {
                  border = "1.5px solid #aaa";
                  weight = 600;
                }
                return (
                  <div
                    key={i}
                    onClick={() => onDaySelect(date)}
                    onMouseEnter={() => setHoveredDate(date)}
                    onMouseLeave={() => setHoveredDate(null)}
                    style={{
                      height: 44,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      cursor: "pointer",
                      userSelect: "none",
                      background: bg,
                      color,
                      border: border as any,
                      fontWeight: weight,
                      fontSize: 15,
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ lineHeight: 1 }}>{date.getDate()}</span>
                    {(hasInc || hasExp) && (
                      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
                        {hasInc && <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: isEdge ? "rgba(255,255,255,0.6)" : "#10B981" }} />}
                        {hasExp && <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: isEdge ? "rgba(255,255,255,0.6)" : "#EF4444" }} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.07)", fontSize: 12, color: "#aaa" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
                Income
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                Expense
              </span>
              <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: 11, color: "#ccc" }}>Click to select a day</span>
            </div>
            {activeDate && <DayPanel date={activeDate} transactions={activeTx} categories={categories} formatCurrency={formatCurrency} />}
          </>
        )}
        {(fromDate || toDate) && (
          <button
            onClick={() => {
              onFromChange(null);
              onToChange(null);
            }}
            style={{
              display: "block",
              width: "100%",
              marginTop: 12,
              background: "none",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 8,
              cursor: "pointer",
              padding: "6px 0",
              fontSize: 12,
              color: "#aaa",
            }}
          >
            Clear date filter
          </button>
        )}
      </CardBody>
    </Card>
  );
}

// ============================================================
// DELETE CONFIRM MODAL
// ============================================================

function DeleteConfirmModal({ transaction, isDeleting, onConfirm, onClose }: { transaction: Transaction; isDeleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal isOpen toggle={onClose} size="sm">
      <ModalHeader toggle={onClose}>Delete transaction</ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 14, margin: 0 }}>
          Are you sure you want to delete <strong>{transaction.description}</strong>?
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>This cannot be undone.</p>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================
// TRANSACTION CARD (mobile only)
// ============================================================

function TransactionCard({
  tx,
  categories,
  formatCurrency,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  categories: Category[];
  formatCurrency: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = resolveCategory(tx, categories);
  const isInvestment = !!tx.isInvestmentTransaction;
  const isPositive = isInvestment ? tx.contributionType === "withdrawal" : tx.type === "income";
  const dateStr = formatTable(firestoreToDate(tx.date));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}
    >
      {/* Category icon bubble */}
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

      {/* Payee + category + date */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 500, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
          {cat?.name ?? "—"} · {dateStr}
        </p>
        {isInvestment && (
          <span
            style={{
              ...getInvestmentBadgeStyle(tx.contributionType),
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: 10,
              marginTop: 2,
            }}
          >
            {tx.contributionType === "withdrawal" ? "Withdrawal" : "Deposit"}
          </span>
        )}
      </div>

      {/* Amount */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontWeight: 600, fontSize: 15, margin: 0, color: getAmountColor(tx) }}>
          {isPositive ? "+" : "−"}
          {formatCurrency(tx.amount)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {!isInvestment && (
          <Button size="sm" color="light" style={{ padding: "4px 8px" }} onClick={onEdit}>
            <FiEdit2 size={13} />
          </Button>
        )}
        <Button size="sm" color="light" style={{ padding: "4px 8px", color: "var(--bs-danger)" }} onClick={onDelete}>
          <FiTrash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE CONTEXT BAR
// Sticky bar inside the card showing result count + dismissible
// filter pills so the user always knows what they are looking at.
// ============================================================

function MobileContextBar({
  totalItems,
  currentPage,
  pageSize,
  searchQuery,
  selectedCategory,
  fromDate,
  toDate,
  onClearSearch,
  onClearCategory,
  onClearDates,
}: {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  searchQuery: string;
  selectedCategory: string;
  fromDate: Date | null;
  toDate: Date | null;
  onClearSearch: () => void;
  onClearCategory: () => void;
  onClearDates: () => void;
}) {
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);
  const hasFilters = searchQuery !== "" || selectedCategory !== "all" || fromDate !== null || toDate !== null;

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "#1a1a2e",
    color: "#fff",
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };

  const pillClearBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.65)",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    padding: 0,
    marginLeft: 2,
  };

  let dateLabel = "";
  if (fromDate && toDate) {
    dateLabel = isSameDay(fromDate, toDate) ? formatShort(fromDate) : `${formatShort(fromDate)} – ${formatShort(toDate)}`;
  } else if (fromDate) {
    dateLabel = `From ${formatShort(fromDate)}`;
  } else if (toDate) {
    dateLabel = `Until ${formatShort(toDate)}`;
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        background: "var(--bs-body-bg, #fff)",
      }}
    >
      {/* Result count */}
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>
        {totalItems === 0 ? "No results" : `${from}–${to} of ${totalItems}`}
      </span>

      {/* Active filter pills */}
      {hasFilters && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {searchQuery !== "" && (
            <span style={pillStyle}>
              "{searchQuery}"
              <button style={pillClearBtn} onClick={onClearSearch} title="Clear search">
                x
              </button>
            </span>
          )}
          {selectedCategory !== "all" && (
            <span style={pillStyle}>
              {selectedCategory}
              <button style={pillClearBtn} onClick={onClearCategory} title="Clear category">
                x
              </button>
            </span>
          )}
          {dateLabel && (
            <span style={pillStyle}>
              {dateLabel}
              <button style={pillClearBtn} onClick={onClearDates} title="Clear dates">
                x
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PAGINATION CONTROLS
// ============================================================

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
        borderTop: "1px solid rgba(0,0,0,0.06)",
        fontSize: 13,
        color: "#888",
      }}
    >
      <span>
        {from}–{to} of {totalItems}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <Button size="sm" color="light" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} style={{ padding: "2px 10px", fontSize: 13 }}>
          Prev
        </Button>
        <span style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: 13, fontWeight: 500, color: "#444" }}>
          {currentPage} / {totalPages}
        </span>
        <Button size="sm" color="light" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} style={{ padding: "2px 10px", fontSize: 13 }}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// CATEGORY SELECT — shared between desktop and mobile
// ============================================================

function CategorySelect({
  selectedCategory,
  uniqueCategoriesByName,
  mobile = false,
  onChange,
  onClear,
}: {
  selectedCategory: string;
  uniqueCategoriesByName: Category[];
  mobile?: boolean;
  onChange: (val: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ position: "relative", width: "100%", ...(mobile ? { flex: 1 } : {}) }}>
      <Input
        type="select"
        bsSize="sm"
        value={selectedCategory}
        onChange={(e) => onChange(e.target.value)}
        style={{
          paddingRight: selectedCategory !== "all" ? "2rem" : undefined,
          backgroundImage: "none",
          width: "100%",
        }}
      >
        <option value="all">{mobile ? "All" : "All Categories"}</option>
        {uniqueCategoriesByName.map((c) => (
          <option key={c.id} value={c.name}>
            {c.icon} {c.name}
          </option>
        ))}
      </Input>
      {selectedCategory !== "all" && (
        <button
          onClick={onClear}
          style={{
            position: "absolute",
            right: "1.8rem",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#555252",
            fontSize: "16px",
            lineHeight: 1,
            padding: "0 4px",
            zIndex: 2,
          }}
          title="Clear filter"
        >
          x
        </button>
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [fromDate, setFromDate] = useState<Date | null>(new Date(new Date().getFullYear(), 0, 1));
  const [toDate, setToDate] = useState<Date | null>(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [deleteTransaction, setDeleteTransaction] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useTransactions();
  const { data: categories = [], isLoading: catLoading, isError: catError } = useCategories();
  const { format: formatCurrency } = useCurrencyConverter();

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
        toast.success("Transaction deleted.");
        setDeleteTransaction(null);
      },
      onError: () => toast.error("Failed to delete transaction."),
    });
  };

  const handleDaySelect = useCallback(
    (date: Date) => {
      if (isSameDay(date, fromDate) && isSameDay(date, toDate)) {
        setFromDate(null);
        setToDate(null);
      } else {
        setFromDate(date);
        setToDate(date);
      }
      setCurrentPage(1);
    },
    [fromDate, toDate],
  );

  const handleFromChange = useCallback(
    (d: Date | null) => {
      setFromDate(d);
      if (d && toDate && midnight(d) > midnight(toDate)) setToDate(null);
      setCurrentPage(1);
    },
    [toDate],
  );

  const handleToChange = useCallback(
    (d: Date | null) => {
      if (d && fromDate && midnight(d) < midnight(fromDate)) return;
      setToDate(d);
      setCurrentPage(1);
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

  // Pre-convert dates once
  const transactionsWithDates = useMemo(
    () =>
      transactions.map((tx) => ({
        tx,
        date: firestoreToDate(tx.date),
        createdAt: firestoreToDate(tx.createdAt),
      })),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const fromMid = fromDate ? midnight(fromDate) : null;
    const toMid = toDate ? midnight(toDate) : null;
    const query = debouncedSearch.toLowerCase();

    return transactionsWithDates
      .filter(({ tx, date }) => {
        const matchSearch = tx.description.toLowerCase().includes(query);
        const matchCat =
          selectedCategory === "all" ||
          (tx.isInvestmentTransaction ? selectedCategory === "Investments" : categories.filter((c) => c.name === selectedCategory).some((c) => c.id === tx.categoryId));

        const txMid = midnight(date);
        let matchDate = true;
        if (fromMid !== null && toMid !== null) matchDate = txMid >= fromMid && txMid <= toMid;
        else if (fromMid !== null) matchDate = txMid >= fromMid;
        else if (toMid !== null) matchDate = txMid <= toMid;

        return matchSearch && matchCat && matchDate;
      })
      .sort((a, b) => {
        const dateDiff = b.date.getTime() - a.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .map(({ tx }) => tx);
  }, [transactionsWithDates, debouncedSearch, selectedCategory, fromDate, toDate, categories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedCategory, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, currentPage]);

  const isLoading = txLoading || catLoading;
  const isError = txError || catError;

  const handleCategoryChange = useCallback((val: string) => {
    setSelectedCategory(val);
    setCurrentPage(1);
  }, []);

  const handleCategoryClear = useCallback(() => {
    setSelectedCategory("all");
    setCurrentPage(1);
  }, []);

  return (
    <Container fluid className="py-2" style={{ minHeight: "100vh" }}>
      {/* ======================================================
          DESKTOP layout (lg+)
      ====================================================== */}
      <div className="d-none d-lg-block">
        <Row className="g-4">
          <Col lg={4}>
            {isLoading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : (
              <TransactionCalendar
                allTransactions={transactions}
                categories={categories}
                fromDate={fromDate}
                toDate={toDate}
                onFromChange={handleFromChange}
                onToChange={handleToChange}
                onDaySelect={handleDaySelect}
                formatCurrency={formatCurrency}
              />
            )}
          </Col>

          <Col lg={8}>
            {isError && (
              <Alert color="danger" className="mb-3">
                Failed to load transactions. Please refresh.
              </Alert>
            )}

            <Card className="border-0 shadow-sm mb-3">
              <CardBody className="py-2">
                <Row className="g-2 align-items-center">
                  <Col md={5}>
                    <InputGroup size="sm">
                      <InputGroupText>
                        <i className="bi bi-search" />
                      </InputGroupText>
                      <Input type="text" placeholder="Search payee or memo…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </InputGroup>
                  </Col>
                  <Col md={4}>
                    <CategorySelect
                      selectedCategory={selectedCategory}
                      uniqueCategoriesByName={uniqueCategoriesByName}
                      onChange={handleCategoryChange}
                      onClear={handleCategoryClear}
                    />
                  </Col>
                  <Col md={3} className="d-flex justify-content-end">
                    <Button color="primary" size="sm" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAddModal(true)}>
                      + Add Transaction
                    </Button>
                  </Col>
                </Row>
              </CardBody>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardBody className="p-0">
                {isLoading ? (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                  </div>
                ) : (
                  <div style={{ maxHeight: "80vh", overflowY: "auto", overflowX: "auto" }}>
                    <Table hover className="mb-0">
                      <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#f8f9fa" }}>
                        <tr>
                          <th className="ps-3" style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                            DATE
                          </th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>PAYEE</th>
                          <th style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>CATEGORY</th>
                          <th className="text-end" style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                            AMOUNT
                          </th>
                          <th className="text-end pe-3" style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
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
                            const isPositive = tx.isInvestmentTransaction ? tx.contributionType === "withdrawal" : tx.type === "income";
                            return (
                              <tr key={tx.id}>
                                <td className="ps-3" style={{ fontSize: 13, color: "#888" }}>
                                  {formatTable(firestoreToDate(tx.date))}
                                </td>
                                <td style={{ fontWeight: 500 }}>{tx.description}</td>
                                <td>
                                  <Badge color="light" className="text-dark">
                                    {cat?.icon} {cat?.name ?? "—"}
                                  </Badge>
                                </td>
                                <td className="text-end">
                                  <span style={{ fontWeight: 500, color: getAmountColor(tx) }}>
                                    {isPositive ? "+" : "−"}
                                    {formatCurrency(tx.amount)}
                                  </span>
                                </td>
                                <td className="text-end pe-3">
                                  <div className="d-flex justify-content-end gap-2 align-items-center">
                                    {tx.isInvestmentTransaction && (
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
                                        {tx.contributionType === "withdrawal" ? "Withdrawal" : "Deposit"}
                                      </span>
                                    )}
                                    {!tx.isInvestmentTransaction && (
                                      <Button size="sm" color="light" style={{ padding: "2px 8px" }} onClick={() => setEditTransaction(tx)} title="Edit">
                                        <FiEdit2 size={13} />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      color="light"
                                      style={{ padding: "2px 8px", color: "var(--bs-danger)" }}
                                      onClick={() => setDeleteTransaction(tx)}
                                      title="Delete"
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

      {/* ======================================================
          MOBILE layout (<lg)
      ====================================================== */}
      <div className="d-lg-none">
        {isError && (
          <Alert color="danger" className="mb-3">
            Failed to load transactions. Please refresh.
          </Alert>
        )}

        {isLoading ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
          </div>
        ) : (
          <TransactionCalendar
            allTransactions={transactions}
            categories={categories}
            fromDate={fromDate}
            toDate={toDate}
            onFromChange={handleFromChange}
            onToChange={handleToChange}
            onDaySelect={handleDaySelect}
            formatCurrency={formatCurrency}
          />
        )}

        {/*
          Sticky filter row.
          If your app has a fixed top navbar, change `top: 0` to match
          its height e.g. `top: 56` so the bar doesn't slide behind it.
        */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "var(--bs-body-bg, #fff)",
            paddingTop: 10,
            paddingBottom: 8,
            borderBottom: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          <div className="d-flex gap-2 align-items-center">
            <Input type="text" bsSize="sm" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1 }} />
            <CategorySelect
              selectedCategory={selectedCategory}
              uniqueCategoriesByName={uniqueCategoriesByName}
              mobile
              onChange={handleCategoryChange}
              onClear={handleCategoryClear}
            />
            <Button color="primary" size="sm" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAddModal(true)}>
              +
            </Button>
          </div>
        </div>

        {/* Transaction list card with context bar at the top */}
        <Card className="border-0 shadow-sm mt-2">
          {/*
            Context bar: sticky inside the card so it stays visible
            while scrolling the transaction list. Shows result count
            and dismissible filter pills — much more useful than
            column labels on a card-based layout.
          */}
          <MobileContextBar
            totalItems={filteredTransactions.length}
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
            searchQuery={debouncedSearch}
            selectedCategory={selectedCategory}
            fromDate={fromDate}
            toDate={toDate}
            onClearSearch={() => {
              setSearchQuery("");
              setCurrentPage(1);
            }}
            onClearCategory={handleCategoryClear}
            onClearDates={() => {
              setFromDate(null);
              setToDate(null);
              setCurrentPage(1);
            }}
          />

          <CardBody className="p-0">
            {isLoading ? (
              <div className="text-center py-5">
                <Spinner color="primary" />
              </div>
            ) : pagedTransactions.length === 0 ? (
              <p className="text-center text-muted py-5 mb-0">No transactions found</p>
            ) : (
              pagedTransactions.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  formatCurrency={formatCurrency}
                  onEdit={() => setEditTransaction(tx)}
                  onDelete={() => setDeleteTransaction(tx)}
                />
              ))
            )}
          </CardBody>

          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredTransactions.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        </Card>
      </div>

      <AddTransactionModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} categories={categories} onSubmit={handleCreate} />
      {editTransaction && <EditTransactionModal transaction={editTransaction} isOpen onClose={() => setEditTransaction(null)} categories={categories} onSubmit={handleUpdate} />}
      {deleteTransaction && (
        <DeleteConfirmModal transaction={deleteTransaction} isDeleting={deleteMutation.isPending} onConfirm={handleDelete} onClose={() => setDeleteTransaction(null)} />
      )}
    </Container>
  );
}
