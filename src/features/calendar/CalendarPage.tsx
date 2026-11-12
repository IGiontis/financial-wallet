import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FiChevronRight, FiGitCommit, FiGrid } from "react-icons/fi";
import { startOfMonth } from "date-fns";
import { PageShell } from "../../shared/components/PageShell";
import { Skeleton, SkeletonPageHeader } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCalendarSources } from "./useCalendarSources";
import { MoneyTimeline } from "./components/MoneyTimeline";
import { MonthCalendar } from "./components/MonthCalendar";
import { signedMoney } from "./signedMoney";
import { ViewSwitch } from "../../shared/components/ViewSwitch";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { CALENDAR_KIND_ICON, calendarItems, groupByDay, monthTotals, shownNet, type CalendarDay, type CalendarItem, type CalendarKind } from "./calendarDays";
import { InfoLegend, type LegendEntry } from "../../shared/components/InfoLegend";
import { dayKey } from "./components/dayKey";
import styles from "./css/CalendarPage.module.css";

// The calendar: the month on one screen, each day showing what comes in above
// and what goes out below. A tap on a day says what is on it.
//
// It fills the page rather than sitting in a card, and on a phone the same grid
// fits: seven columns of about 48px, an amount in each half of a day and the
// names left for the sheet a tap opens.

const KIND_PATH: Record<CalendarKind, string> = { bill: "/bills/pay", income: "/incomes/record", debt: "/debts", goal: "/goals" };

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const { sources, first, last, isLoading } = useCalendarSources();
  // Per device, as the other pages' views are: how one likes to read it.
  const [calendarView, setCalendarView] = useLocalStorage<"month" | "timeline">("calendar-view", "month");
  const { now } = sources;

  const [month, setMonth] = useState(() => startOfMonth(now));
  // The tapped day lives here, above the view switch: back from the timeline, it is still open.
  const [picked, setPicked] = useState<Date | null>(null);

  const items = useMemo(() => calendarItems(month, sources), [month, sources]);
  const days = useMemo(() => groupByDay(items), [items]);
  const totals = useMemo(() => monthTotals(items), [items]);

  if (isLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader action={false} />
        <Skeleton height={460} />
      </PageShell>
    );
  }

  return (
    <PageShell className={styles.page}>
      {/* The month as a grid of days, or the same days as a tree, a week to a month at a time. */}
      <div className="mb-3">
        <ViewSwitch
          block
          data-tour="calendar-views"
          label={t("calendar.viewLabel")}
          value={calendarView}
          onChange={setCalendarView}
          options={[
            { id: "month", label: t("calendar.viewMonth"), icon: FiGrid },
            { id: "timeline", label: t("calendar.viewTimeline"), icon: FiGitCommit },
          ]}
        />
      </div>

      {calendarView === "timeline" ? (
        <>
          {/* The month view's heading is its month; this one's is the page's own name. */}
          <h1 className="visually-hidden">{t("nav.calendar")}</h1>
          <MoneyTimeline side="all" sources={sources} first={first} last={last} formatCurrency={formatCurrency} locale={lang} />
        </>
      ) : (
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          now={now}
          first={first}
          last={last}
          data-tour="calendar-grid"
          picked={picked}
          onPick={setPicked}
          // What it is drawn from, said once: it is not the transactions' calendar.
          // The key to the colours sits beside it, behind the ⓘ.
          scope={
            <>
              <p className={styles.scope}>{t("calendar.scope")}</p>
              <InfoLegend title={t("calendar.keyTitle")} entries={calendarKey(t)}>
                <p>{t("calendar.keySign")}</p>
              </InfoLegend>
            </>
          }
          totals={{
            in: totals.in,
            out: totals.out,
            inSub: t("calendar.cameOf", { amount: formatCurrency(totals.inDone) }),
            outSub: t("calendar.paidOf", { amount: formatCurrency(totals.outDone) }),
          }}
          dayOf={(date) => {
            const day = days.get(date.getDate());
            if (!day) return undefined;
            return {
              look: daySides(day),
              net: netOf(day),
              spoken: day.items.map((i) => `${i.label} ${i.direction === "in" ? "+" : "−"}${formatCurrency(i.amount)}`).join(", "),
            };
          }}
          renderDay={(date, onLeave) => {
            const day = days.get(date.getDate());
            return day ? <DayList day={day} formatCurrency={formatCurrency} onLeave={onLeave} /> : null;
          }}
          emptyDay={t("calendar.emptyDay")}
        />
      )}
    </PageShell>
  );
}

/** The figure in a cell: what is still to happen, in less out — see `shownNet`. */
const netOf = (day: CalendarDay) => shownNet(day);

/**
 * What is on a day, in the calendars' shared colour language (`dayTone`):
 * green for money in, red for money out, a diagonal when a day has both — and
 * each side pale once everything on it has happened, whatever the other side
 * is doing. All of it done is struck through; anything late carries the dot.
 */
function daySides(day: CalendarDay) {
  return {
    in: day.in ? (day.in.allDone ? "done" : "todo") : undefined,
    out: day.out ? (day.out.allDone ? "done" : "todo") : undefined,
    late: day.items.some((i) => i.state === "late"),
  } as const;
}

/** The colours explained, in the order they are met — each drawn with the classes a day itself uses. */
const calendarKey = (t: TFunction): LegendEntry[] => [
  dayKey("in", { in: "todo" }, t("calendar.keyIn")),
  dayKey("inDone", { in: "done" }, t("calendar.keyInDone")),
  dayKey("out", { out: "todo" }, t("calendar.keyOut")),
  dayKey("outDone", { out: "done" }, t("calendar.keyOutDone")),
  dayKey("both", { in: "todo", out: "todo" }, t("calendar.keyBoth")),
  dayKey("allDone", { in: "done", out: "done" }, t("calendar.keyAllDone")),
  dayKey("late", { late: true }, t("calendar.keyLate")),
  dayKey("today", { today: true }, t("calendar.keyToday")),
];

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
                    {CALENDAR_KIND_ICON[item.kind]}
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
