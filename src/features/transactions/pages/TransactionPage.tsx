import { useState, useMemo, useCallback, useRef } from "react";
import { Container, Row, Col, Card, CardBody, Input, Table, Badge, InputGroup, InputGroupText, Button } from "reactstrap";
import { type Transaction, type Category } from "../../../shared/types/IndexTypes";

// ============================================================
// DUMMY DATA
// ============================================================

const DUMMY_CATEGORIES: Category[] = [
  { id: "1", name: "Shopping", type: "expense", icon: "🛒", color: "#3B82F6", isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() },
  { id: "2", name: "Groceries", type: "expense", icon: "🥬", color: "#10B981", isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() },
  { id: "3", name: "Paycheck", type: "income", icon: "💰", color: "#8B5CF6", isDefault: true, userId: null, createdAt: new Date(), updatedAt: new Date() },
];

const DUMMY_TRANSACTIONS: Transaction[] = [
  {
    id: "1",
    userId: "user1",
    amount: 1200.0,
    type: "income",
    categoryId: "3",
    date: new Date("2022-07-01"),
    description: "Salary Inc.",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    userId: "user1",
    amount: 45.0,
    type: "expense",
    categoryId: "2",
    date: new Date("2022-07-03"),
    description: "Local Grocer",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  { id: "3", userId: "user1", amount: 70.45, type: "expense", categoryId: "1", date: new Date("2022-07-05"), description: "Amazon", createdAt: new Date(), updatedAt: new Date() },
  {
    id: "4",
    userId: "user1",
    amount: 200.0,
    type: "income",
    categoryId: "3",
    date: new Date("2022-07-08"),
    description: "Freelance Work",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  { id: "5", userId: "user1", amount: 85.0, type: "expense", categoryId: "1", date: new Date("2022-07-10"), description: "Target", createdAt: new Date(), updatedAt: new Date() },
  {
    id: "6",
    userId: "user1",
    amount: 120.0,
    type: "expense",
    categoryId: "2",
    date: new Date("2022-07-12"),
    description: "Whole Foods",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "7",
    userId: "user1",
    amount: 1200.0,
    type: "income",
    categoryId: "3",
    date: new Date("2022-07-15"),
    description: "Salary Inc.",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ============================================================
// CONSTANTS
// ============================================================

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ============================================================
// HELPERS
// ============================================================

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Midnight timestamp — strips time so date comparisons are safe */
function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local "YYYY-MM-DD" key — avoids UTC-shift bugs from toISOString() */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date → <input type="date"> value string */
function toInputValue(d: Date | null): string {
  return d ? toDateKey(d) : "";
}

/** <input type="date"> value string → Date (local midnight) */
function fromInputValue(v: string): Date | null {
  if (!v) return null;
  const [y, m, day] = v.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Format for display: "Jul 01, 2022" */
function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/** Format for table: "07/01/2022" */
function formatTable(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(d);
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// ============================================================
// DATE FIELD — custom input that avoids browser-chrome placeholder issues
// Uses a hidden <input type="date"> triggered via showPicker()
// ============================================================

interface DateFieldProps {
  label: string;
  date: Date | null;
  onChange: (d: Date | null) => void;
  min?: string;
  max?: string;
}

function DateField({ label, date, onChange, min, max }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // showPicker() is standard in all modern browsers (Chrome 99+, Firefox 101+, Safari 16+)
  const openPicker = () => (inputRef.current as HTMLInputElement & { showPicker?: () => void })?.showPicker?.();

  return (
    <div
      onClick={openPicker}
      style={{
        flex: 1,
        cursor: "pointer",
        border: "1px solid rgba(0,0,0,0.13)",
        borderRadius: 8,
        padding: "7px 10px",
        position: "relative",
        background: "#fafafa",
        minWidth: 0,
        userSelect: "none",
      }}
    >
      {/* Label */}
      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>

      {/* Value or placeholder */}
      <div style={{ fontSize: 13, color: date ? "#1a1a2e" : "#ccc", fontWeight: date ? 500 : 400 }}>{date ? formatDisplay(date) : "Select date"}</div>

      {/* Clear button — only when a date is set */}
      {date && (
        <button
          onClick={(e) => {
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
          }}
          title="Clear date"
        >
          ×
        </button>
      )}

      {/* The actual native input — invisible, just used for its date picker */}
      <input
        ref={inputRef}
        type="date"
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
        value={toInputValue(date)}
        min={min}
        max={max}
        onChange={(e) => onChange(fromInputValue(e.target.value))}
        tabIndex={-1}
      />
    </div>
  );
}

// ============================================================
// DAY PANEL — transaction preview shown below the calendar grid
// ============================================================

interface DayPanelProps {
  date: Date;
  transactions: Transaction[];
  categories: Category[];
}

function DayPanel({ date, transactions, categories }: DayPanelProps) {
  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", marginTop: 12, paddingTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 8 }}>{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>

      {transactions.length === 0 ? (
        <p style={{ fontSize: 13, color: "#bbb", margin: 0 }}>No transactions on this day.</p>
      ) : (
        transactions.map((tx) => {
          const cat = categories.find((c) => c.id === tx.categoryId);
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
              <span style={{ fontWeight: 500, color: tx.type === "income" ? "#10B981" : "#EF4444" }}>
                {tx.type === "expense" ? "-" : "+"}
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
// TRANSACTION CALENDAR
// Single unified card: date range inputs + 2-step nav calendar
// ============================================================

type CalView = "days" | "months" | "years";

interface CalendarProps {
  allTransactions: Transaction[];
  categories: Category[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}

function TransactionCalendar({ allTransactions, categories, fromDate, toDate, onFromChange, onToChange, onDaySelect }: CalendarProps) {
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [calView, setCalView] = useState<CalView>("days");
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  // Transaction lookup map
  const txMap = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    allTransactions.forEach((tx) => {
      const k = toDateKey(tx.date);
      if (!map[k]) map[k] = [];
      map[k].push(tx);
    });
    return map;
  }, [allTransactions]);

  // Calendar grid cells
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  // Month navigation arrows — always navigate days view
  const prevMonth = () => {
    setCalView("days");
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setCalView("days");
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  // Year range for the year picker grid: 12 years centred around viewYear
  const yearStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearStart + i);

  // Popover: hovered day takes priority, then fromDate
  const activeDate = hoveredDate ?? fromDate ?? null;
  const activeTx = activeDate ? (txMap[toDateKey(activeDate)] ?? []) : [];

  // ── Shared button style helpers
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

  const pickerCell = (active: boolean, onClick: () => void, label: string): React.ReactNode => (
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

  const hasDateFilter = !!(fromDate || toDate);

  return (
    <Card className="border-0 shadow-sm">
      <CardBody className="p-3">
        {/* ── FROM / TO date fields ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <DateField label="FROM" date={fromDate} onChange={onFromChange} max={toInputValue(toDate) || undefined} />
          <DateField label="TO" date={toDate} onChange={onToChange} min={toInputValue(fromDate) || undefined} />
        </div>

        {/* ── Divider ── */}
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", marginBottom: 12 }} />

        {/* ── Calendar nav: ‹ [Month Year label] › ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button style={navBtn} onClick={prevMonth}>
            ‹
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
            <span style={{ fontSize: 10, marginLeft: 4, color: "#aaa" }}>▾</span>
          </button>

          <button style={navBtn} onClick={nextMonth}>
            ›
          </button>
        </div>

        {/* ── YEAR PICKER view ── */}
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

        {/* ── MONTH PICKER view ── */}
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

        {/* ── DAYS view ── */}
        {calView === "days" && (
          <>
            {/* Day-of-week headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
              {DAY_NAMES_SHORT.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#bbb", padding: "2px 0" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {cells.map((date, i) => {
                if (!date) return <div key={i} style={{ height: 38 }} />;

                const k = toDateKey(date);
                const dayTx = txMap[k] ?? [];
                const hasInc = dayTx.some((t) => t.type === "income");
                const hasExp = dayTx.some((t) => t.type === "expense");

                const isFrom = isSameDay(date, fromDate);
                const isTo = isSameDay(date, toDate);
                const isEdge = isFrom || isTo;
                const inRange = !!(fromDate && toDate && midnight(date) >= midnight(fromDate) && midnight(date) <= midnight(toDate) && !isEdge);
                const isHov = isSameDay(date, hoveredDate);
                const isToday = isSameDay(date, today);

                let bg = "transparent";
                let color = "#1a1a2e";
                let border = "none";
                let weight = 400;

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
                      border,
                      fontWeight: weight,
                      fontSize: 15,
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ lineHeight: 1 }}>{date.getDate()}</span>
                    {(hasInc || hasExp) && (
                      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
                        {hasInc && (
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: "50%",
                              display: "inline-block",
                              background: isEdge ? "rgba(255,255,255,0.6)" : "#10B981",
                            }}
                          />
                        )}
                        {hasExp && (
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: "50%",
                              display: "inline-block",
                              background: isEdge ? "rgba(255,255,255,0.6)" : "#EF4444",
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(0,0,0,0.07)",
                fontSize: 12,
                color: "#aaa",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
                Income
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                Expense
              </span>
              <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: 11, color: "#ccc" }}>Click to select a day</span>
            </div>

            {/* Day transaction preview panel */}
            {activeDate && <DayPanel date={activeDate} transactions={activeTx} categories={categories} />}
          </>
        )}

        {/* Clear filter link — only when a filter is active */}
        {hasDateFilter && (
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
// MAIN PAGE
// ============================================================

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Default: Jan 1 of current year → today
  const [fromDate, setFromDate] = useState<Date | null>(new Date(new Date().getFullYear(), 0, 1));
  const [toDate, setToDate] = useState<Date | null>(new Date());

  // Calendar click → fills both FROM and TO with the same day
  // Clicking the already-selected day clears the filter
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

  // FROM input: if new from is after current to, clear to
  const handleFromChange = useCallback(
    (d: Date | null) => {
      setFromDate(d);
      if (d && toDate && midnight(d) > midnight(toDate)) setToDate(null);
    },
    [toDate],
  );

  // TO input: must be ≥ fromDate
  const handleToChange = useCallback(
    (d: Date | null) => {
      if (d && fromDate && midnight(d) < midnight(fromDate)) return;
      setToDate(d);
    },
    [fromDate],
  );

  const getCategoryName = (id: string) => DUMMY_CATEGORIES.find((c) => c.id === id)?.name ?? "Unknown";

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return DUMMY_TRANSACTIONS.filter((tx) => {
      const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "all" || tx.categoryId === selectedCategory;

      let matchesDate = true;
      const txMid = midnight(tx.date);
      if (fromDate && toDate) matchesDate = txMid >= midnight(fromDate) && txMid <= midnight(toDate);
      else if (fromDate) matchesDate = txMid >= midnight(fromDate);
      else if (toDate) matchesDate = txMid <= midnight(toDate);

      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [searchQuery, selectedCategory, fromDate, toDate]);

  return (
    <Container fluid className="py-2">
      <Row className="g-4">
        {/* ── LEFT: unified calendar card ── */}
        <Col lg={4}>
          <TransactionCalendar
            allTransactions={DUMMY_TRANSACTIONS}
            categories={DUMMY_CATEGORIES}
            fromDate={fromDate}
            toDate={toDate}
            onFromChange={handleFromChange}
            onToChange={handleToChange}
            onDaySelect={handleDaySelect}
          />
        </Col>

        {/* ── RIGHT: filters + table ── */}
        <Col lg={8}>
          {/* Filters row — search | category | Add button */}
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
                  <Input type="select" bsSize="sm" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    <option value="all">All Categories</option>
                    {DUMMY_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md={3} className="d-flex justify-content-end">
                  <Button color="primary" size="sm" style={{ whiteSpace: "nowrap" }}>
                    <i className="bi bi-plus-circle me-1" />
                    Add Transaction
                  </Button>
                </Col>
              </Row>
            </CardBody>
          </Card>

          {/* Transactions table */}
          <Card className="border-0 shadow-sm">
            <CardBody className="p-0">
              <Table responsive hover className="mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3" style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                      DATE
                    </th>
                    <th style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>PAYEE</th>
                    <th style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>CATEGORY</th>
                    <th className="text-end pe-3" style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                      AMOUNT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-5">
                        <i className="bi bi-inbox d-block mb-2" style={{ fontSize: 28, opacity: 0.3 }} />
                        No transactions found
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="ps-3" style={{ fontSize: 13, color: "#888" }}>
                          {formatTable(tx.date)}
                        </td>
                        <td style={{ fontWeight: 500 }}>{tx.description}</td>
                        <td>
                          <Badge color="light" className="text-dark">
                            {DUMMY_CATEGORIES.find((c) => c.id === tx.categoryId)?.icon} {getCategoryName(tx.categoryId)}
                          </Badge>
                        </td>
                        <td className="text-end pe-3">
                          <span style={{ fontWeight: 500, color: tx.type === "income" ? "#10B981" : "#EF4444" }}>
                            {tx.type === "expense" && "-"}
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
