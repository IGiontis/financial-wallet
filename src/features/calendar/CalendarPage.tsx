import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { addMonths, endOfMonth, isSameDay, startOfMonth, subMonths } from "date-fns";
import { PageShell } from "../../shared/components/PageShell";
import { MonthPicker } from "../../shared/components/DateField";
import { Skeleton, SkeletonPageHeader } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { plannableDebts } from "../debts/debtsUtils";
import { useIncomes } from "../incomes/useIncomes";
import { resolveIncomes } from "../incomes/incomesUtils";
import { useInvestmentGoals } from "../budget/useInvestments";
import { PLANNER_KEYS, cleanOneOffs, cleanSkipped } from "../plannerPage/plannerInputs";
import type { OneOff } from "../plannerPage/plannerUtils";
import { calendarItems, calendarPlans, groupByDay, monthTotals, shownNet, type CalendarDay, type CalendarItem, type CalendarKind } from "./calendarDays";
import styles from "./css/CalendarPage.module.css";

// The calendar: the month on one screen, each day showing what comes in above
// and what goes out below. A tap on a day says what is on it.
//
// It fills the page rather than sitting in a card, and on a phone the same grid
// fits: seven columns of about 48px, an amount in each half of a day and the
// names left for the sheet a tap opens.

const KIND_ICON: Record<CalendarKind, string> = { bill: "🧾", income: "💰", debt: "🏦", goal: "🎯" };
const KIND_PATH: Record<CalendarKind, string> = { bill: "/bills/pay", income: "/incomes/record", debt: "/debts", goal: "/goals" };

/** The colours explained, in the order they are met. */
const KEY: { classes: string[]; text: string; dot?: boolean }[] = [
  { classes: ["onlyIn"], text: "calendar.keyIn" },
  { classes: ["onlyIn", "inPale"], text: "calendar.keyInDone" },
  { classes: ["onlyOut"], text: "calendar.keyOut" },
  { classes: ["onlyOut", "outPale"], text: "calendar.keyOutDone" },
  { classes: ["both"], text: "calendar.keyBoth" },
  { classes: ["both", "inPale", "outPale", "allDone"], text: "calendar.keyAllDone" },
  { classes: [], text: "calendar.keyLate", dot: true },
  { classes: ["today"], text: "calendar.keyToday" },
];

/** Below a tablet: the day's list sits under the month instead of in a dialog. */
const PHONE_QUERY = "(max-width: 767.98px)";

/** How many months either way the calendar goes. */
const MONTHS_EACH_WAY = 12;

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: allDebts = [], isLoading: debtsLoading } = useDebts();
  const { data: goals = [], isLoading: goalsLoading } = useInvestmentGoals();
  const { incomes, transactions, overrides, lastReadingAt, now, isLoading: incomesLoading } = useIncomes();
  const [storedOneOffs] = useWorkspaceSetting<OneOff[]>(PLANNER_KEYS.oneOffs, []);
  const [storedSkipped] = useWorkspaceSetting<string[]>(PLANNER_KEYS.skip, []);

  const [month, setMonth] = useState(() => startOfMonth(now));
  // A phone reads the chosen day in a list under the month — today's, until
  // another is tapped. A tablet or a desk opens it in a dialog, only when tapped.
  const phone = useNarrowScreen(PHONE_QUERY);
  const [picked, setPicked] = useState<Date | null>(null);
  const selected = picked ?? (phone && isSameDay(month, startOfMonth(now)) ? now : null);
  const setSelected = setPicked;

  const debts = useMemo(() => plannableDebts(allDebts), [allDebts]);
  const skipIds = useMemo(() => new Set(cleanSkipped(storedSkipped)), [storedSkipped]);
  // An extra income the planner has switched off is not on the calendar either.
  const oneOffs = useMemo(() => cleanOneOffs(storedOneOffs).filter((o) => !skipIds.has(o.id)), [storedOneOffs, skipIds]);

  const first = useMemo(() => startOfMonth(subMonths(now, MONTHS_EACH_WAY)), [now]);
  const last = useMemo(() => startOfMonth(addMonths(now, MONTHS_EACH_WAY)), [now]);

  // Every time of every income over the whole stretch the calendar pages
  // through — wider than the Incomes page resolves, which stops two months out.
  const statuses = useMemo(
    () => resolveIncomes(incomes, { transactions, overrides, lastReadingAt, now }, first, endOfMonth(last)),
    [incomes, transactions, overrides, lastReadingAt, now, first, last],
  );
  const incomeName = useMemo(() => {
    const names = new Map(incomes.map((i) => [i.id, i.name]));
    return (id: string) => names.get(id) ?? "—";
  }, [incomes]);

  const actuals = useMemo(() => ({ transactions, debts, overrides, lastReadingAt }), [transactions, debts, overrides, lastReadingAt]);
  const plans = useMemo(() => calendarPlans({ goals, debts, actuals, skipIds, now }), [goals, debts, actuals, skipIds, now]);

  const items = useMemo(
    // The instalments to come are the open debts' (above); the payments made are every debt's.
    () => calendarItems(month, { now, bills, statuses, incomeName, oneOffs, debts: allDebts, ...plans }),
    [month, now, bills, statuses, incomeName, oneOffs, allDebts, plans],
  );
  const days = useMemo(() => groupByDay(items), [items]);
  const totals = useMemo(() => monthTotals(items), [items]);

  const monthTitle = useMemo(() => new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(month), [lang, month]);
  const dayTitle = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }), [lang]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i))), [lang]);
  // Whole euros in a cell, signed. A desk's cell has room for the currency, and
  // it comes from the page's own formatter so it converts like every other
  // figure; a phone's is about 48px, where the figure goes without it and
  // thousands as 1,45k. The cents are the sheet's.
  const withCurrency = (n: number) => formatCurrency(Math.round(Math.abs(n))).replace(/[.,]00(?!\d)/, "");
  const plain = useMemo(() => {
    const whole = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    const thousands = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
    return (n: number) => (Math.abs(n) >= 1000 ? `${thousands.format(Math.round(Math.abs(n) / 10) / 100)}k` : whole.format(Math.abs(n)));
  }, [lang]);

  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const total = Math.ceil((lead + length) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - lead + 1));
  }, [month]);

  if (billsLoading || debtsLoading || goalsLoading || incomesLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader action={false} />
        <Skeleton height={460} />
      </PageShell>
    );
  }

  const step = (by: number) => {
    setMonth((m) => addMonths(m, by));
    setSelected(null);
  };
  const atStart = month <= first;
  const atEnd = month >= last;
  const thisMonth = isSameDay(month, startOfMonth(now));

  const selectedDay: CalendarDay | undefined = selected ? days.get(selected.getDate()) : undefined;

  return (
    <PageShell className={styles.page}>
      <div className={styles.head}>
        <button type="button" className={styles.nav} onClick={() => step(-1)} disabled={atStart} aria-label={t("calendar.prev")}>
          <FiChevronLeft aria-hidden />
        </button>
        <div className={styles.title}>
          {/* The title is the way to any month and year: it opens the grid of months. */}
          <MonthPicker
            value={month}
            onChange={(picked) => {
              setMonth(picked);
              setSelected(null);
            }}
            minDate={first}
            maxDate={endOfMonth(last)}
            className={styles.titleButton}
            // The month too: a label alone would hide the title it is written on.
            label={`${monthTitle} · ${t("calendar.pickMonth")}`}
            caption={
              <>
                <h1 className="h5 fw-semibold text-body-emphasis mb-0">{monthTitle}</h1>
                <FiChevronDown size={16} aria-hidden />
              </>
            }
          />
          {!thisMonth && (
            <button
              type="button"
              className={styles.todayLink}
              onClick={() => {
                setMonth(startOfMonth(now));
                setSelected(null);
              }}
            >
              {t("calendar.today")}
            </button>
          )}
        </div>
        <button type="button" className={styles.nav} onClick={() => step(1)} disabled={atEnd} aria-label={t("calendar.next")}>
          <FiChevronRight aria-hidden />
        </button>
      </div>

      {/* What it is drawn from, said once: it is not the transactions' calendar. */}
      <p className={styles.scope}>{t("calendar.scope")}</p>

      <div className={styles.totals}>
        <span className={`${styles.totalIn} tone-tile tone-tile-income`}>
          <span className={styles.totalLabel}>{t("calendar.in")}</span>
          <strong>{formatCurrency(totals.in)}</strong>
          <span className={styles.totalSub}>{t("calendar.cameOf", { amount: formatCurrency(totals.inDone) })}</span>
        </span>
        <span className={`${styles.totalOut} tone-tile tone-tile-expense`}>
          <span className={styles.totalLabel}>{t("calendar.out")}</span>
          <strong>{formatCurrency(totals.out)}</strong>
          <span className={styles.totalSub}>{t("calendar.paidOf", { amount: formatCurrency(totals.outDone) })}</span>
        </span>
      </div>

      <div className={styles.weekdays} aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      <div className={styles.grid} role="group" aria-label={monthTitle}>
        {cells.map((date) => {
          const inside = date.getMonth() === month.getMonth();
          if (!inside) return <span key={date.toISOString()} className={styles.outside} aria-hidden />;
          const day = days.get(date.getDate());
          const isToday = isSameDay(date, now);
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`${styles.day} ${day ? dayClass(day) : ""} ${isToday ? styles.today : ""} ${selected && isSameDay(date, selected) ? styles.selected : ""}`}
              aria-pressed={!!selected && isSameDay(date, selected)}
              onClick={() => setSelected(date)}
              aria-label={`${dayTitle.format(date)}${day ? ` · ${day.items.map((i) => `${i.label} ${i.direction === "in" ? "+" : "−"}${formatCurrency(i.amount)}`).join(", ")}` : ""}`}
            >
              <span className={styles.num}>{date.getDate()}</span>
              {day && (
                <>
                  <span className={`${styles.net} ${netOf(day) > 0 ? styles.netPos : netOf(day) < 0 ? styles.netNeg : ""}`}>
                    <span className={styles.signMark}>{sign(day)}</span>
                    <span className={styles.withCurrency}>{withCurrency(netOf(day))}</span>
                    <span className={styles.plain}>{plain(netOf(day))}</span>
                  </span>
                  {day.items.some((i) => i.state === "late") && <span className={styles.lateDot} aria-hidden />}
                </>
              )}
            </button>
          );
        })}
      </div>


      {/* On a phone the day's list is under the month rather than in a dialog
          over it: there is room for it, and the month stays in sight. */}
      {phone && (
        <section className={styles.dayPanel} aria-live="polite">
          {!selected ? (
            <p className={styles.dayHint}>{t("calendar.pickDay")}</p>
          ) : (
            <>
              <div className={styles.dayPanelTitle}>{dayTitle.format(selected)}</div>
              {!selectedDay ? <p className={styles.dayHint}>{t("calendar.emptyDay")}</p> : <DayList day={selectedDay} formatCurrency={formatCurrency} />}
            </>
          )}
        </section>
      )}

      {/* A tablet or a desk: the day in a dialog, as it was. */}
      {!phone && selected && (
        <Modal isOpen toggle={() => setSelected(null)} centered scrollable>
          <ModalHeader toggle={() => setSelected(null)}>
            <span style={{ fontSize: 15, textTransform: "capitalize" }}>{dayTitle.format(selected)}</span>
          </ModalHeader>
          <ModalBody>
            {!selectedDay ? <p className={styles.dayHint}>{t("calendar.emptyDay")}</p> : <DayList day={selectedDay} formatCurrency={formatCurrency} onLeave={() => setSelected(null)} />}
          </ModalBody>
        </Modal>
      )}

      {/* What each colour means, each drawn with the classes a day itself uses —
          so the key cannot drift from the cells it explains. */}
      <section className={styles.key} aria-label={t("calendar.keyTitle")}>
        <div className={styles.keyTitle}>{t("calendar.keyTitle")}</div>
        <ul className={styles.keyList}>
          {KEY.map((entry) => (
            <li key={entry.text}>
              <span className={`${styles.keyCell} ${entry.classes.map((name) => styles[name]).join(" ")}`} aria-hidden>
                {entry.dot && <span className={styles.lateDot} />}
              </span>
              <span>{t(entry.text)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.dayHint}>{t("calendar.keySign")}</p>
      </section>
    </PageShell>
  );
}

/** The figure in a cell: what is still to happen, in less out — see `shownNet`. */
const netOf = (day: CalendarDay) => shownNet(day);

/** "+" for a day that nets in, "−" for one that nets out, nothing at exactly zero. */
const sign = (day: CalendarDay) => (netOf(day) > 0 ? "+" : netOf(day) < 0 ? "−" : "");

/**
 * The cell's colours, side by side: green for money in, red for money out, a
 * diagonal from one to the other when a day has both — and each side pale once
 * everything on it has happened, whatever the other side is doing.
 */
function dayClass(day: CalendarDay): string {
  return [
    day.in?.allDone ? styles.inPale : "", day.out?.allDone ? styles.outPale : "", day.in && day.out ? styles.both : day.in ? styles.onlyIn : styles.onlyOut,
    // All of it happened: struck through with green.
    day.items.every((item) => item.state === "done") ? styles.allDone : "",
  ].join(" ");
}

/** Signed, with its currency: "+70,00 €", "−25,98 €". */
const signedMoney = (n: number, formatCurrency: (n: number) => string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
const netOfItems = (items: CalendarItem[]) => Math.round(items.reduce((sum, i) => sum + (i.direction === "in" ? i.amount : -i.amount), 0) * 100) / 100;

/**
 * A day's list, in two parts: what is still to pay or to come, and what has
 * already happened — the part that needs doing is never searched for among the
 * part that is done. Each part with what it nets to, and the day's whole below.
 */
function DayList({ day, formatCurrency, onLeave }: { day: CalendarDay; formatCurrency: (n: number) => string; /** Following a link out of a dialog closes it. */ onLeave?: () => void }) {
  const { t } = useTranslation();
  const sections = [
    { key: "unpaid", items: day.items.filter((i) => i.state !== "done") },
    { key: "paid", items: day.items.filter((i) => i.state === "done") },
  ].filter((section) => section.items.length > 0);
  const whole = netOfItems(day.items);

  return (
    <>
      {sections.map((section) => (
        <div key={section.key} className="mb-3">
          <div className={`${styles.sheetHead} ${section.key === "paid" ? styles.sheetHeadPaid : ""}`}>
            <span>{t(section.key === "paid" ? "calendar.groupPaid" : "calendar.groupUnpaid")}</span>
            <span>{signedMoney(netOfItems(section.items), formatCurrency)}</span>
          </div>
          <ul className={`${styles.sheetList} ${section.key === "paid" ? styles.sheetListPaid : ""}`}>
            {section.items.map((item) => (
              <li key={item.id}>
                <Link to={KIND_PATH[item.kind]} className={styles.sheetItem} onClick={onLeave}>
                  <span className={styles.sheetIcon} aria-hidden>
                    {KIND_ICON[item.kind]}
                  </span>
                  <span className={styles.sheetMain}>
                    <span className={styles.sheetName}>{item.label}</span>
                    <span className={`${styles.sheetState} ${styles[`state_${item.state}`]}`}>{t(`calendar.state.${item.kind}.${item.state}`)}</span>
                  </span>
                  <span className={`${styles.sheetAmount} ${item.direction === "in" ? styles.amountIn : styles.amountOut}`}>
                    {item.direction === "in" ? "+" : "−"}
                    {item.approximate ? "≈" : ""}
                    {formatCurrency(item.amount)}
                  </span>
                  <FiChevronRight size={15} aria-hidden className={styles.sheetGo} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sections.length > 1 && (
        <div className={styles.sheetNet}>
          <span>{t("calendar.net")}</span>
          <strong style={{ color: whole < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>{signedMoney(whole, formatCurrency)}</strong>
        </div>
      )}
    </>
  );
}
