import { useState, useMemo } from "react";
import { Card, CardBody, Modal, ModalHeader, ModalBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../../shared/components/DateField";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { firestoreToDate, parseISODay, standaloneMonthName, toISODay } from "../../../shared/utils/dates";
import { localeUpperCase } from "../../../shared/utils/upperCase";
import { isSameDay, midnight, toDateKey, formatDisplay } from "../transactionDates";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { matchPreset, presetRange, rangeMonth, stepMonth, type DateRange, type RangePreset } from "../dateRanges";
import styles from "./css/MobileDateFilter.module.css";

export interface CalendarProps {
  allTransactions: Transaction[];
  fromDate: Date | null;
  toDate: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  onDaySelect: (d: Date) => void;
}

/**
 * One end of the From/To range, above the grid.
 *
 * Wraps the shared field so these two behave like every other date in the app —
 * same calendar, same Greek months, same theme — instead of falling through to
 * whatever the OS draws. The range still gets set by clicking the grid below;
 * this is for jumping somewhere far away without paging there month by month.
 */
function RangeDateField({ label, date, onChange, min, max }: { label: string; date: Date | null; onChange: (d: Date | null) => void; min?: Date; max?: Date }) {
  const { t } = useTranslation();
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
      <DateField
        small
        clearable
        value={date ? toISODay(date) : ""}
        onChange={(v) => onChange(v ? parseISODay(v) : null)}
        placeholder={t("transactions.selectDate")}
        minDate={min}
        maxDate={max}
      />
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
  // English array, so the calendar actually follows the app language. The
  // header names the month itself, so Greek needs "Μάρτιος", not "Μαρτίου".
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, m) => standaloneMonthName(lang, new Date(2020, m, 1))), [lang]);
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
        <RangeDateField label={localeUpperCase(t("transactions.dateFrom"), lang)} date={fromDate} onChange={onFromChange} max={toDate ?? undefined} />
        <RangeDateField label={localeUpperCase(t("transactions.dateTo"), lang)} date={toDate} onChange={onToChange} min={fromDate ?? undefined} />
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

/**
 * The phone's date filter: a month you step through, the usual spans one tap
 * away, and any other From–To in a sheet.
 *
 * It was two narrow boxes, "From 01 Jan 2026" and "To 07 Oct 2026", each
 * wrapped onto three lines, and a calendar of days behind them — so looking
 * at September meant opening the calendar and tapping two days. Now ‹ › steps
 * a whole month at a time, the chips set this month, last month, three
 * months, the year or everything, and "From–To…" opens the calendar with its
 * two date fields for anything else.
 */
export function MobileCalendar(props: CalendarProps & { onRangeChange: (range: DateRange) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [expanded, setExpanded] = useState(false);
  const [now] = useState(() => new Date());
  const range: DateRange = { from: props.fromDate, to: props.toDate };
  const chosen = matchPreset(range, now);
  const month = rangeMonth(range, now);
  const back = stepMonth(range, -1, now);
  const forward = stepMonth(range, 1, now);

  // What the filter shows, said once: a month by its name, any other span by its ends.
  const summary = month
    ? `${standaloneMonthName(lang, new Date(month.year, month.month, 1))} ${month.year}`
    : range.from || range.to
      ? `${range.from ? formatDisplay(range.from, lang) : "…"} – ${range.to ? formatDisplay(range.to, lang) : "…"}`
      : t("transactions.rangeAllDates");

  const presets: { id: RangePreset; label: string }[] = [
    { id: "thisMonth", label: t("transactions.rangeThisMonth") },
    { id: "lastMonth", label: t("transactions.rangeLastMonth") },
    { id: "threeMonths", label: t("transactions.rangeThreeMonths") },
    { id: "thisYear", label: t("transactions.rangeThisYear") },
    { id: "all", label: t("transactions.rangeAll") },
  ];

  return (
    <Card className="border-0 shadow-sm mb-3" style={{ flexShrink: 0 }}>
      <CardBody className="p-3">
        <div className={styles.monthStepper}>
          <button type="button" className={styles.stepButton} onClick={() => back && props.onRangeChange(back)} disabled={!back} aria-label={t("transactions.previousMonth")}>
            <FiChevronLeft size={18} aria-hidden />
          </button>
          <button type="button" className={styles.stepLabel} onClick={() => setExpanded(true)} aria-label={t("transactions.pickDates")}>
            <span className={styles.stepLabelText}>{summary}</span>
            <FiCalendar size={14} aria-hidden />
          </button>
          <button type="button" className={styles.stepButton} onClick={() => forward && props.onRangeChange(forward)} disabled={!forward} aria-label={t("transactions.nextMonth")}>
            <FiChevronRight size={18} aria-hidden />
          </button>
        </div>

        <div className={styles.rangeChips} role="group" aria-label={t("transactions.pickDates")}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={chosen === preset.id}
              className={`${styles.rangeChip} ${chosen === preset.id ? styles.rangeChipActive : ""}`}
              onClick={() => props.onRangeChange(presetRange(preset.id, now))}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={!chosen && !month}
            className={`${styles.rangeChip} ${!chosen && !month ? styles.rangeChipActive : ""}`}
            onClick={() => setExpanded(true)}
          >
            {t("transactions.rangeCustom")}
          </button>
        </div>

        {/* A sheet rather than an inline panel: the mobile screen is a fixed-
            height column, so expanding in place stole the room from the list
            below until it had none left — opening the calendar hid the very
            rows it exists to filter. */}
        <Modal isOpen={expanded} toggle={() => setExpanded(false)} centered scrollable>
          <ModalHeader toggle={() => setExpanded(false)}>{t("transactions.pickDates")}</ModalHeader>
          <ModalBody>
            <CalendarGrid {...props} />
          </ModalBody>
        </Modal>
      </CardBody>
    </Card>
  );
}
