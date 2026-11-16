import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { FiAlertTriangle, FiCalendar, FiCheck, FiChevronLeft, FiChevronRight, FiClock, FiFlag } from "react-icons/fi";
import { useLoadMore } from "../../../shared/hooks/useLoadMore";
import { ViewSwitch } from "../../../shared/components/ViewSwitch";
import { MoneyTree, type TreeLeaf } from "../../../shared/components/MoneyTree";
import { CALENDAR_KIND_ICON, calendarItemsBetween, type CalendarItem, type CalendarKind, type CalendarSources } from "../calendarDays";
import styles from "../css/MoneyTimeline.module.css";
import { dateFormat } from "../../../shared/utils/dates";

/** What a timeline shows: money in, money out, or both — in to the left of the trunk, out to the right. */
export type TimelineSide = "in" | "out" | "all";

/** How long a stretch it shows at a time: a month to begin with, up to a year. */
type Span = "month" | "quarter" | "half" | "year";

/** How many months a span covers. */
const SPAN_MONTHS: Record<Span, number> = { month: 1, quarter: 3, half: 6, year: 12 };

/** Days drawn at a time: a year of a busy calendar is a few hundred, drawn as the reader gets to them. */
const DAYS_PAGE = 21;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The days a stretch covers, from the month it is anchored on. */
function stretch(span: Span, anchor: Date): { from: Date; to: Date } {
  const from = startOfMonth(anchor);
  return { from, to: startOfDay(endOfMonth(addMonths(from, SPAN_MONTHS[span] - 1))) };
}

/**
 * What is coming and what came, as a tree (`MoneyTree`): money in to the left
 * of the trunk and out to the right, or one of them with the days taking turns.
 *
 * A month at a time to begin with — this one — or three, six or twelve, stepped
 * with ‹ ›. A long stretch is drawn a few weeks at a
 * time as it is scrolled (`useLoadMore`), so a year costs no more to open
 * than a month. The items are the calendar's own (`calendarItemsBetween`), so
 * a leaf here and the same day on «Ημερολόγιο» say the same.
 */
export function MoneyTimeline({
  side,
  kinds,
  sources,
  first,
  last,
  formatCurrency,
  locale,
}: {
  side: TimelineSide;
  /** Only these kinds — «Πάγια» shows its bills, not the instalments and goals beside them. */
  kinds?: readonly CalendarKind[];
  sources: CalendarSources;
  /** The earliest and latest months the sources hold. */
  first: Date;
  last: Date;
  formatCurrency: (n: number) => string;
  locale: string;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfDay(sources.now), [sources.now]);
  const [span, setSpan] = useState<Span>("month");
  const [anchor, setAnchor] = useState(() => startOfMonth(today));
  // No further than the sources reach: past their last month the incomes,
  // loans and goals are not there to show.
  const end = useMemo(() => startOfDay(endOfMonth(last)), [last]);
  const { from, to } = useMemo(() => {
    const whole = stretch(span, anchor);
    return { from: whole.from, to: whole.to > end ? end : whole.to };
  }, [span, anchor, end]);

  const items = useMemo(
    () => calendarItemsBetween(from, to, sources).filter((item) => (side === "all" || item.direction === side) && (!kinds || kinds.includes(item.kind))),
    [from, to, sources, side, kinds],
  );
  // Named for what it holds: the bills alone, or a side of the money.
  const heading = t(kinds?.length === 1 ? `timeline.title_${kinds[0]}` : `timeline.title_${side}`);

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

  const monthFmt = useMemo(() => dateFormat("monthYear", locale), [locale]);
  const monthShortFmt = useMemo(() => dateFormat("monthYearShort", locale), [locale]);
  const title = span === "month" ? monthFmt.format(from) : `${monthShortFmt.format(from)} – ${monthShortFmt.format(to)}`;

  const moved = (by: number) => addMonths(startOfMonth(anchor), by * SPAN_MONTHS[span]);
  const step = (by: number) => setAnchor(moved(by));
  // Back as far as a whole stretch fits; forward while the next one starts
  // inside the sources — its tail is cut at their last month.
  const canBack = stretch(span, moved(-1)).from >= first;
  const canForward = stretch(span, moved(1)).from <= end;
  const holdsToday = today >= from && today <= to;
  const backToToday = () => setAnchor(startOfMonth(today));

  // Drawn a few weeks at a time: the next lot on its way as the end comes into view.
  const { limit, hasMore, more, sentinel } = useLoadMore(days.length, DAYS_PAGE, `${span}|${from.getTime()}|${side}|${kinds?.join(",") ?? ""}`);
  const shown = days.slice(0, limit);

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
        {/* Money put aside for a goal is not a bill: it goes in, today. */}
        {t(item.kind === "goal" ? "timeline.state_goalToday" : item.direction === "out" ? "timeline.state_toPay" : "timeline.state_late")}
      </>
    ) : upcoming && item.first ? (
      // Not running yet: this is where it starts, said plainly.
      <>
        <FiFlag size={11} aria-hidden />
        {t("timeline.state_first")}
        {daysAway > 0 && ` · ${t("timeline.inDays", { count: daysAway })}`}
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
    <section className={`card p-3 p-lg-4 ${styles.card}`} aria-label={heading}>
      <div className="stat-head d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>{heading}</span>
        <ViewSwitch
          label={t("timeline.spanLabel")}
          value={span}
          onChange={(next) => {
            setSpan(next);
            setAnchor(startOfMonth(today));
          }}
          // On the narrowest phones each by its length alone — «1μ», «3μ», «12μ».
          options={[
            { id: "month", label: t("timeline.month"), icon: FiCalendar, short: t("timeline.shortMonths", { count: 1 }) },
            { id: "quarter", label: t("timeline.months", { count: 3 }), short: t("timeline.shortMonths", { count: 3 }) },
            { id: "half", label: t("timeline.months", { count: 6 }), short: t("timeline.shortMonths", { count: 6 }) },
            { id: "year", label: t("timeline.year"), short: t("timeline.shortMonths", { count: 12 }) },
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
        <button type="button" className={`btn btn-link btn-sm p-0 d-block mx-auto mb-2 ${styles.todayLink}`} onClick={backToToday}>
          {t("timeline.backToToday")}
        </button>
      )}

      <div className={styles.totals}>
        {side !== "out" && (
          <span>
            {t("timeline.in")} <b className={styles.totalIn}>+{formatCurrency(totalIn)}</b>
          </span>
        )}
        {side !== "in" && (
          <span>
            {t("timeline.out")} <b className={styles.totalOut}>−{formatCurrency(totalOut)}</b>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-body-secondary text-center mb-0 mt-3">{t("timeline.empty")}</p>
      ) : (
        <>
          <MoneyTree
            days={shown.map((day) => ({ date: day.date, leaves: day.items.map(toLeaf) }))}
            today={today}
            formatCurrency={formatCurrency}
            locale={locale}
            label={title}
          />
          {hasMore && (
            <>
              <div ref={sentinel} aria-hidden />
              <button type="button" className={`btn btn-link btn-sm d-block mx-auto mt-2 ${styles.todayLink}`} onClick={more}>
                {t("timeline.showMore", { count: days.length - limit })}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default MoneyTimeline;
