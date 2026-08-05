import { useState, useMemo, useRef } from "react";
import { Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { firestoreToDate } from "../../../shared/utils/dates";
import { isSameDay, midnight, toDateKey, toInputValue, fromInputValue, formatDisplay } from "../transactionDates";

export interface CalendarProps {
  allTransactions: Transaction[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}

function DateField({ label, date, onChange, min, max }: { label: string; date: Date | null; onChange: (d: Date | null) => void; min?: string; max?: string }) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.showPicker()}
      style={{ flex: 1, border: "1px solid var(--color-border-primary)", borderRadius: 8, padding: "7px 10px", position: "relative", background: "var(--color-background-secondary)", minWidth: 0, cursor: "pointer" }}
    >
      <div style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: date ? "var(--color-accent-strong)" : "var(--color-text-secondary)", fontWeight: date ? 500 : 400 }}>
        {date ? formatDisplay(date, i18n.resolvedLanguage ?? "en") : t("transactions.selectDate")}
      </div>
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
            color: "var(--color-text-secondary)",
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

type CalView = "days" | "months" | "years";

function CalendarGrid({
  allTransactions,
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onDaySelect,
}: {
  allTransactions: Transaction[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [calView, setCalView] = useState<CalView>("days");

  // Locale-aware month/weekday names — built from Intl instead of a hardcoded
  // English array, so the calendar actually follows the app language.
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { month: "long" });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2020, m, 1)));
  }, [lang]);
  const monthShort = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { month: "short" });
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2020, m, 1)));
  }, [lang]);
  const dayNamesShort = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: "short" });
    // Sunday-first, matching the grid's day-of-week numbering below.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [lang]);

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
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    setCalView("days");
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const yearStart = Math.floor(viewYear / 12) * 12;
  const yearOptions = Array.from({ length: 12 }, (_, i) => yearStart + i);

  const navBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--color-text-secondary)", padding: "2px 8px", borderRadius: 6 };

  const pickerCell = (active: boolean, onClick: () => void, label: string) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        background: active ? "var(--color-accent-strong)" : "transparent",
        color: active ? "var(--color-accent-on-strong)" : "var(--color-text-primary)",
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
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <DateField label={t("transactions.dateFrom").toUpperCase()} date={fromDate} onChange={onFromChange} max={toInputValue(toDate) || undefined} />
        <DateField label={t("transactions.dateTo").toUpperCase()} date={toDate} onChange={onToChange} min={toInputValue(fromDate) || undefined} />
      </div>
      <div style={{ borderTop: "1px solid var(--color-border-tertiary)", marginBottom: 12 }} />
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
            color: "var(--color-accent-strong)",
            borderRadius: 6,
            padding: "4px 8px",
            textDecoration: calView !== "days" ? "underline" : "none",
            textUnderlineOffset: 3,
          }}
        >
          {monthNames[viewMonth]} {viewYear}
          <span style={{ fontSize: 10, marginLeft: 4, color: "var(--color-text-secondary)" }}>v</span>
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
          {monthShort.map((m, i) =>
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
            {dayNamesShort.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", padding: "2px 0" }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((date, i) => {
              if (!date) return <div key={i} style={{ height: 38 }} />;
              const k = toDateKey(date);
              const dayTx = txMap[k] ?? [];
              const hasInc = dayTx.some((t) => t.type === "income" || (t.isInvestmentTransaction && t.contributionType === "withdrawal"));
              const hasExp = dayTx.some((t) => t.type === "expense" || (t.isInvestmentTransaction && t.contributionType === "deposit"));
              const isFrom = isSameDay(date, fromDate);
              const isTo = isSameDay(date, toDate);
              const isEdge = isFrom || isTo;
              const inRange = !!(fromDate && toDate && midnight(date) >= midnight(fromDate) && midnight(date) <= midnight(toDate) && !isEdge);
              const isToday = isSameDay(date, today);
              let bg = "transparent",
                color = "var(--color-text-primary)",
                border = "none",
                weight = 400;
              if (isEdge) {
                bg = "var(--color-accent-strong)";
                color = "var(--color-accent-on-strong)";
                weight = 600;
              } else if (inRange) {
                bg = "var(--color-accent-soft)";
              }
              if (isToday && !isEdge) {
                border = "1.5px solid var(--color-border-primary)";
                weight = 600;
              }
              return (
                <div
                  key={i}
                  onClick={() => onDaySelect(date)}
                  style={{
                    height: 38,
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
                      {hasInc && <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: isEdge ? "color-mix(in srgb, var(--color-accent-on-strong) 70%, transparent)" : "var(--color-income)" }} />}
                      {hasExp && <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: isEdge ? "color-mix(in srgb, var(--color-accent-on-strong) 70%, transparent)" : "var(--color-expense)" }} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-income)", display: "inline-block" }} />
              {t("transactions.income")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-expense)", display: "inline-block" }} />
              {t("transactions.expense")}
            </span>
          </div>
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
            border: "1px solid var(--color-border-tertiary)",
            borderRadius: 8,
            cursor: "pointer",
            padding: "6px 0",
            fontSize: 12,
            color: "var(--color-text-secondary)",
          }}
        >
          {t("transactions.clearDateFilter")}
        </button>
      )}
    </>
  );
}

export function TransactionCalendar(props: {
  allTransactions: Transaction[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardBody className="p-3">
        <CalendarGrid {...props} />
      </CardBody>
    </Card>
  );
}

export function MobileCalendar(props: {
  allTransactions: Transaction[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [expanded, setExpanded] = useState(false);
  const hasFilter = !!(props.fromDate || props.toDate);
  return (
    <Card className="border-0 shadow-sm mb-3" style={{ flexShrink: 0 }}>
      <CardBody className="p-3">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flex: 1 }}>
            {(["from", "to"] as const).map((which) => {
              const date = which === "from" ? props.fromDate : props.toDate;
              const label = which === "from" ? t("transactions.dateFrom") : t("transactions.dateTo");
              return (
                <div
                  key={which}
                  style={{
                    flex: 1,
                    border: `1px solid ${date ? "var(--color-accent-strong)" : "var(--color-border-primary)"}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    background: date ? "var(--color-accent-strong)" : "var(--color-background-secondary)",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(true)}
                >
                  <div style={{ fontSize: 9, color: date ? "color-mix(in srgb, var(--color-accent-on-strong) 70%, transparent)" : "var(--color-text-secondary)", fontWeight: 600, letterSpacing: "0.07em" }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 12, color: date ? "var(--color-accent-on-strong)" : "var(--color-text-secondary)", fontWeight: date ? 500 : 400 }}>{date ? formatDisplay(date, lang) : t("transactions.anyDate")}</div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              // The active fill is dark in BOTH themes, so its label must stay
              // light — using the accent's on-colour turned it dark-on-dark.
              background: expanded ? "var(--color-tooltip-bg)" : "var(--color-background-secondary)",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 13,
              color: expanded ? "var(--color-tooltip-text)" : "var(--color-text-secondary)",
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {expanded ? t("transactions.hideCalendar") : t("transactions.showCalendar")}
          </button>
          {hasFilter && (
            <button
              onClick={() => {
                props.onFromChange(null);
                props.onToChange(null);
              }}
              style={{
                background: "none",
                border: "1px solid var(--color-border-tertiary)",
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--color-text-secondary)",
                flexShrink: 0,
              }}
            >
              {t("transactions.clear")}
            </button>
          )}
        </div>
        {expanded && (
          <div style={{ marginTop: 12 }}>
            <div style={{ borderTop: "1px solid var(--color-border-tertiary)", marginBottom: 12 }} />
            <CalendarGrid {...props} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
