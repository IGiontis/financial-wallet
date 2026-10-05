import { useMemo, useState } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { addMonths, differenceInCalendarDays, isSameDay, startOfMonth } from "date-fns";
import { toISOMonth } from "../../../shared/utils/dates";
import { isSettled, monthSummary, needsYou, type Income, type IncomeStatus } from "../incomesUtils";
import { statusTag, type IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

// Option 2, «Ημερολόγιο του μήνα»: each income a mark on its day — green where
// it came, an outline where it was expected but came on another day, amber
// where it is late. Early and late are seen at a glance: the 25th green, the
// 30th outlined. A tap on a day says what happened that day; a tap on an empty
// one starts a new income on it.
//
// At 375px a cell is about 48px: figures fit, names do not, which is why the
// month's list follows the grid and the names join the marks on a desktop.

export interface CalendarActions {
  onOpen: (income: Income) => void;
  onArrive: (income: Income, status: IncomeStatus) => void;
  /** «Δεν ήταν αυτό» on a record found for an income — stop matching it. */
  onNotThis: (status: IncomeStatus) => void;
  /** A tap on an empty day: a new income, monthly on that day. */
  onNewOnDay: (day: number) => void;
}

type MarkKind = "arrived" | "expected" | "late" | "ask" | "due";

interface Mark {
  kind: MarkKind;
  status: IncomeStatus;
}

const MARK_CLASS: Record<MarkKind, string> = { arrived: styles.markArrived, expected: styles.markExpected, late: styles.markLate, ask: styles.markAsk, due: styles.markDue };

// The whole day is lit in the colour of what happened on it, so the month reads
// at a glance — green where money came, amber where it is late, blue where it
// is on its way — before a single figure is read. A day with two things on it
// takes the one that most needs you.
const DAY_CLASS: Record<MarkKind, string> = { arrived: styles.dayArrived, expected: styles.dayExpected, late: styles.dayLate, ask: styles.dayAsk, due: styles.dayDue };
const PRIORITY: MarkKind[] = ["late", "ask", "due", "arrived", "expected"];
const dayTone = (marks: Mark[]): MarkKind | undefined => PRIORITY.find((kind) => marks.some((m) => m.kind === kind));

export function IncomeCalendar({
  statuses,
  incomes,
  formatCurrency,
  f,
  now,
  bounds,
  onOpen,
  onArrive,
  onNotThis,
  onNewOnDay,
}: CalendarActions & {
  statuses: IncomeStatus[];
  incomes: Map<string, Income>;
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  now: Date;
  /** The months the page has resolved: the calendar does not step outside them. */
  bounds: { from: Date; to: Date };
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => startOfMonth(now));
  const [selected, setSelected] = useState<Date | undefined>();
  const compact = useMemo(() => new Intl.NumberFormat(f.lang, { maximumFractionDigits: 0 }), [f.lang]);
  const dayTitle = useMemo(() => new Intl.DateTimeFormat(f.lang, { weekday: "long", day: "numeric", month: "long" }), [f.lang]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(f.lang, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i))), [f.lang]);

  const name = (id: string) => incomes.get(id)?.name ?? "—";
  const key = toISOMonth(month);
  const summary = useMemo(() => monthSummary(statuses, key), [statuses, key]);

  // Every mark, by the day it falls on. An arrival marks the day it came; its
  // own day gets an outline when that was another day.
  const marks = useMemo(() => {
    const byDay = new Map<string, Mark[]>();
    const add = (date: Date, mark: Mark) => {
      if (toISOMonth(date) !== key) return;
      const k = `${date.getDate()}`;
      byDay.set(k, [...(byDay.get(k) ?? []), mark]);
    };
    for (const status of statuses) {
      if (isSettled(status) && status.arrival) {
        add(status.arrival.date, { kind: "arrived", status });
        if (!status.undated && !isSameDay(status.arrival.date, status.expectedDate)) add(status.expectedDate, { kind: "expected", status });
      } else if (!status.undated && (status.state === "late" || status.state === "ask" || status.state === "due" || status.state === "upcoming")) {
        add(status.expectedDate, { kind: status.state === "late" ? "late" : status.state === "ask" ? "ask" : "due", status });
      }
    }
    return byDay;
  }, [statuses, key]);

  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const inMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const total = Math.ceil((lead + inMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - lead + 1));
  }, [month]);

  const atStart = startOfMonth(month) <= startOfMonth(bounds.from);
  const atEnd = startOfMonth(month) >= startOfMonth(bounds.to);
  const step = (by: number) => {
    setMonth((m) => addMonths(m, by));
    setSelected(undefined);
  };

  const markText = (mark: Mark) => {
    const amount = mark.kind === "arrived" ? mark.status.arrival!.amount : mark.status.expected;
    return `${mark.status.approximate && mark.kind !== "arrived" ? "≈" : ""}${compact.format(amount)}`;
  };

  const selectedMarks = selected ? (marks.get(`${selected.getDate()}`) ?? []) : [];
  const wantsYou = summary.items.filter(needsYou);

  return (
    <div>
      <div className={styles.calHead}>
        <button type="button" className={styles.calNav} onClick={() => step(-1)} disabled={atStart} aria-label={t("incomes.calendar.prev")}>
          <FiChevronLeft aria-hidden />
        </button>
        <div className="text-center" style={{ minWidth: 0 }}>
          <div className="fw-semibold">
            {f.monthName(month)} {month.getFullYear()}
          </div>
          {summary.count > 0 && (
            <div className="text-body-secondary" style={{ fontSize: 12 }}>
              {t("incomes.calendar.summary", { arrived: formatCurrency(summary.arrived), total: `${summary.approximate ? "≈" : ""}${formatCurrency(summary.total)}` })}
            </div>
          )}
        </div>
        <button type="button" className={styles.calNav} onClick={() => step(1)} disabled={atEnd} aria-label={t("incomes.calendar.next")}>
          <FiChevronRight aria-hidden />
        </button>
      </div>

      <div className={styles.calGrid} role="group" aria-label={`${f.monthName(month)} ${month.getFullYear()}`}>
        {weekdays.map((w, i) => (
          <div key={i} className={styles.calWeekday} aria-hidden>
            {w}
          </div>
        ))}
        {cells.map((date) => {
          const inside = date.getMonth() === month.getMonth();
          const dayMarks = inside ? (marks.get(`${date.getDate()}`) ?? []) : [];
          const isToday = isSameDay(date, now);
          const isSelected = !!selected && isSameDay(date, selected);
          const tone = dayTone(dayMarks);
          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={!inside}
              className={`${styles.calDay} ${tone ? DAY_CLASS[tone] : ""} ${inside ? "" : styles.calOutside} ${isToday ? styles.calToday : ""} ${isSelected ? styles.calSelected : ""}`}
              onClick={() => setSelected(isSelected ? undefined : date)}
              aria-pressed={isSelected}
              aria-label={`${dayTitle.format(date)}${dayMarks.length ? ` · ${dayMarks.map((m) => `${name(m.status.incomeId)} ${markText(m)}`).join(", ")}` : ""}`}
            >
              <span className={styles.calNum}>{date.getDate()}</span>
              {dayMarks.slice(0, 2).map((mark) => (
                <span key={`${mark.status.key}-${mark.kind}`} className={`${styles.mark} ${MARK_CLASS[mark.kind]}`}>
                  <span className={styles.markName}>{name(mark.status.incomeId)}</span>
                  {markText(mark)}
                </span>
              ))}
              {dayMarks.length > 2 && <span className={styles.mark}>+{dayMarks.length - 2}</span>}
            </button>
          );
        })}
      </div>

      <div className={styles.calLegend} aria-hidden>
        {(
          [
            ["arrived", "legendArrived"],
            ["late", "legendLate"],
            ["ask", "legendAsk"],
            ["due", "legendDue"],
            ["expected", "legendExpected"],
          ] as const
        ).map(([kind, label]) => (
          <span key={kind}>
            <span className={`${styles.swatch} ${DAY_CLASS[kind]}`} />
            {t(`incomes.calendar.${label}`)}
          </span>
        ))}
      </div>

      {selected && (
        <div className={styles.dayPanel}>
          <div className="fw-semibold mb-2" style={{ fontSize: 14 }}>
            {dayTitle.format(selected)}
          </div>
          {selectedMarks.length === 0 ? (
            <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <span className="text-body-secondary" style={{ fontSize: 13 }}>
                {t("incomes.calendar.emptyDay")}
              </span>
              <Button color="primary" outline size="sm" onClick={() => onNewOnDay(selected.getDate())}>
                {t("incomes.calendar.newOnDay", { day: selected.getDate() })}
              </Button>
            </div>
          ) : (
            selectedMarks.map((mark) => {
              const income = incomes.get(mark.status.incomeId);
              if (!income) return null;
              const tag = statusTag(mark.status, t, f);
              return (
                <div key={`${mark.status.key}-${mark.kind}`} className={styles.fact}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold">{income.name}</div>
                    <div className="text-body-secondary" style={{ fontSize: 12 }}>
                      {tag.text}
                      {isSettled(mark.status) && !isSameDay(mark.status.arrival!.date, mark.status.expectedDate) && ` · ${t("incomes.calendar.itsDay", { date: f.weekdayDate.format(mark.status.expectedDate) })}`}
                    </div>
                    <div className="d-flex gap-3 mt-1" style={{ fontSize: 12.5 }}>
                      <button type="button" className={styles.linkButton} onClick={() => onOpen(income)}>
                        {t("incomes.calendar.open")}
                      </button>
                      {mark.status.state === "found" && (
                        <button type="button" className={styles.linkButton} onClick={() => onNotThis(mark.status)}>
                          {t("incomes.calendar.notThis")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className={styles.factAmount}>{markText(mark)}</span>
                    {mark.status.canArrive && mark.kind !== "expected" && mark.kind !== "arrived" && (
                      <Button color="success" size="sm" onClick={() => onArrive(income, mark.status)}>
                        <FiCheck className="me-1" aria-hidden />
                        {t("incomes.arrive")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {wantsYou.length > 0 && (
        <div className="mt-3">
          <div className={styles.section}>
            <span className={`${styles.sectionTitle} ${styles.toneWaiting}`}>
              {t("incomes.calendar.wantsYou")} · {wantsYou.length}
            </span>
          </div>
          <div className={styles.lines}>
            {wantsYou.map((status) => {
              const income = incomes.get(status.incomeId);
              if (!income) return null;
              return (
                <div key={status.key} className={styles.lineWrap}>
                  <div className={styles.line}>
                    <button type="button" className={styles.lineButton} onClick={() => onOpen(income)}>
                      <span className={styles.lineMain}>
                        <span className={styles.lineName}>
                          {income.name} · {statusTag(status, t, f).text}
                        </span>
                        <span className={styles.lineSub}>{t("incomes.list.wasFor", { date: f.weekdayDate.format(status.date) })}</span>
                      </span>
                    </button>
                    <Button color="success" size="sm" className={styles.arriveButton} onClick={() => onArrive(income, status)}>
                      <FiCheck className="me-1" aria-hidden />
                      {t("incomes.arrive")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {summary.items.length > 0 && (
        <div className={`${styles.lines} mt-3`}>
          {summary.items
            .filter((s) => !needsYou(s))
            .map((status) => {
              const income = incomes.get(status.incomeId);
              if (!income) return null;
              const settled = isSettled(status) && status.arrival;
              const sentence = settled
                ? differenceInCalendarDays(status.arrival!.date, status.date) === 0
                  ? t("incomes.calendar.cameOnDay", { date: f.dayMonth.format(status.arrival!.date) })
                  : t("incomes.calendar.expectedCame", { expected: f.dayMonth.format(status.date), arrived: f.dayMonth.format(status.arrival!.date) }) +
                    (status.earlyDays ? `, ${t("incomes.status.early", { count: status.earlyDays })}` : "")
                : statusTag(status, t, f).text;
              return (
                <div key={status.key} className={styles.lineWrap}>
                  <div className={styles.line}>
                    <button type="button" className={styles.lineButton} onClick={() => onOpen(income)}>
                      <span className={styles.lineMain}>
                        <span className={styles.lineName}>{income.name}</span>
                        <span className={styles.lineSub}>{sentence}</span>
                      </span>
                      <span className={`${styles.lineAmount} ${settled ? styles.amountArrived : ""}`}>
                        {settled ? formatCurrency(status.arrival!.amount) : `${status.approximate ? "≈" : ""}${formatCurrency(status.expected)}`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
