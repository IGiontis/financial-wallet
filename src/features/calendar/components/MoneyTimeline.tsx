import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { FiAlertTriangle, FiCalendar, FiCheck, FiChevronLeft, FiChevronRight, FiClock } from "react-icons/fi";
import { ViewSwitch } from "../../../shared/components/ViewSwitch";
import { MoneyTree, type TreeLeaf } from "../../../shared/components/MoneyTree";
import { CALENDAR_KIND_ICON, calendarItemsBetween, type CalendarItem, type CalendarSources } from "../calendarDays";
import styles from "../css/MoneyTimeline.module.css";

/** What a timeline shows: money in, money out, or both — in to the left of the trunk, out to the right. */
export type TimelineSide = "in" | "out" | "all";

/** How long a stretch it shows at a time. */
type Span = "week" | "twoWeeks" | "month";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The days a stretch covers, from the day it is anchored on. */
function stretch(span: Span, anchor: Date): { from: Date; to: Date } {
  if (span === "month") return { from: startOfMonth(anchor), to: startOfDay(endOfMonth(anchor)) };
  return { from: anchor, to: addDays(anchor, span === "week" ? 6 : 13) };
}

/**
 * What is coming and what came, as a tree (`MoneyTree`): money in to the left
 * of the trunk and out to the right, or one of them with the days taking turns.
 *
 * A week, two weeks or a whole month at a time, stepped with ‹ ›, from today
 * to begin with. The items are the calendar's own (`calendarItemsBetween`), so
 * a leaf here and the same day on «Ημερολόγιο» say the same.
 */
export function MoneyTimeline({
  side,
  sources,
  first,
  last,
  formatCurrency,
  locale,
}: {
  side: TimelineSide;
  sources: CalendarSources;
  /** The earliest and latest months the sources hold. */
  first: Date;
  last: Date;
  formatCurrency: (n: number) => string;
  locale: string;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfDay(sources.now), [sources.now]);
  const [span, setSpan] = useState<Span>("week");
  const [anchor, setAnchor] = useState(today);
  const { from, to } = useMemo(() => stretch(span, anchor), [span, anchor]);

  const items = useMemo(() => calendarItemsBetween(from, to, sources).filter((item) => side === "all" || item.direction === side), [from, to, sources, side]);

  // The days that have something, and today among them even when it has nothing — it is where the reader stands.
  const days = useMemo(() => {
    const byDay = new Map<number, CalendarItem[]>();
    for (const item of items) {
      const key = item.date.getTime();
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    if (today >= from && today <= to && !byDay.has(today.getTime())) byDay.set(today.getTime(), []);
    return [...byDay.entries()].sort(([a], [b]) => a - b).map(([time, list]) => ({ date: new Date(time), items: list }));
  }, [items, today, from, to]);

  const totalIn = round2(items.filter((i) => i.direction === "in").reduce((sum, i) => sum + i.amount, 0));
  const totalOut = round2(items.filter((i) => i.direction === "out").reduce((sum, i) => sum + i.amount, 0));

  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
  const title = span === "month" ? monthFmt.format(from) : `${dayFmt.format(from)} – ${dayFmt.format(to)}`;

  const moved = (by: number) => (span === "month" ? addMonths(startOfMonth(anchor), by) : addDays(anchor, by * (span === "week" ? 7 : 14)));
  const step = (by: number) => setAnchor(moved(by));
  // Only as far as the sources reach — a whole stretch inside them, either way:
  // past their last month the incomes, loans and goals are not there to show.
  const canBack = stretch(span, moved(-1)).from >= first;
  const canForward = stretch(span, moved(1)).to <= startOfDay(endOfMonth(last));
  const holdsToday = today >= from && today <= to;

  // A calendar item as a leaf: its kind's mark, whether it happened, came late or is still to come.
  // A calendar item as a leaf, at one of three weights. What wants doing is
  // what is late — and a payment due today, which has to go today all the same.
  const toLeaf = (item: CalendarItem): TreeLeaf => {
    const daysAway = differenceInCalendarDays(item.date, today);
    const late = item.state === "late" || (item.state === "todo" && item.direction === "out" && daysAway <= 0);
    const upcoming = item.state === "todo" && !late;
    const note = late ? (
      <>
        <FiAlertTriangle size={11} aria-hidden />
        {t(item.direction === "out" ? "timeline.state_toPay" : "timeline.state_late")}
      </>
    ) : upcoming ? (
      <>
        <FiClock size={11} aria-hidden />
        {t("timeline.state_coming")}
        {daysAway > 0 && ` · ${t("timeline.inDays", { count: daysAway })}`}
      </>
    ) : (
      <>
        <FiCheck size={11} aria-hidden />
        {t(item.direction === "out" ? "timeline.state_paid" : "timeline.state_came")}
      </>
    );
    return { id: item.id, direction: item.direction, label: item.label, amount: item.amount, icon: CALENDAR_KIND_ICON[item.kind], approximate: item.approximate, done: item.state === "done", late, upcoming, note };
  };

  return (
    <section className={`card p-3 p-lg-4 ${styles.card}`} aria-label={t(`timeline.title_${side}`)}>
      <div className="stat-head d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>{t(`timeline.title_${side}`)}</span>
        <ViewSwitch
          label={t("timeline.spanLabel")}
          value={span}
          onChange={(next) => {
            setSpan(next);
            setAnchor(next === "month" ? startOfMonth(today) : today);
          }}
          options={[
            { id: "week", label: t("timeline.week") },
            { id: "twoWeeks", label: t("timeline.twoWeeks") },
            { id: "month", label: t("timeline.month"), icon: FiCalendar },
          ]}
        />
      </div>

      <div className={styles.nav}>
        <button type="button" className={styles.step} onClick={() => step(-1)} disabled={!canBack} aria-label={t("timeline.prev")}>
          <FiChevronLeft aria-hidden />
        </button>
        <span className={styles.range}>{title}</span>
        <button type="button" className={styles.step} onClick={() => step(1)} disabled={!canForward} aria-label={t("timeline.next")}>
          <FiChevronRight aria-hidden />
        </button>
      </div>
      {!holdsToday && (
        <button type="button" className={`btn btn-link btn-sm p-0 d-block mx-auto mb-2 ${styles.todayLink}`} onClick={() => setAnchor(span === "month" ? startOfMonth(today) : today)}>
          {t("timeline.backToToday")}
        </button>
      )}

      <div className={styles.totals}>
        {side !== "out" && (
          <span>
            {t("timeline.in")} <b style={{ color: "var(--color-income-text)" }}>+{formatCurrency(totalIn)}</b>
          </span>
        )}
        {side !== "in" && (
          <span>
            {t("timeline.out")} <b>−{formatCurrency(totalOut)}</b>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-body-secondary text-center mb-0 mt-3">{t("timeline.empty")}</p>
      ) : (
        <MoneyTree
          days={days.map((day) => ({ date: day.date, leaves: day.items.map(toLeaf) }))}
          twoSided={side === "all"}
          today={today}
          formatCurrency={formatCurrency}
          locale={locale}
          label={title}
        />
      )}
    </section>
  );
}

export default MoneyTimeline;
