import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useLoadMore } from "../../../shared/hooks/useLoadMore";
import { MoneyTree, type TreeLeaf, type TreeLeafState } from "../../../shared/components/MoneyTree";
import { CALENDAR_KIND_ICON, calendarItemsBetween, type CalendarItem, type CalendarKind, type CalendarSources } from "../calendarDays";
import styles from "../css/MoneyTimeline.module.css";
import { dateFormat } from "../../../shared/utils/dates";

/** What a timeline shows: money in, money out, or both — in to the left of the trunk, out to the right. */
export type TimelineSide = "in" | "out" | "all";

/** Days drawn at a time: a busy month is drawn as the reader gets to it. */
const DAYS_PAGE = 21;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The days one month covers. One month, always (owner, 2026-11-24): the
 * timeline used to offer three, six or twelve months as well, which only made
 * a long scroll of days nobody reads to the end of — the month, stepped with
 * ‹ ›, is what the page is for.
 */
function stretch(anchor: Date): { from: Date; to: Date } {
  const from = startOfMonth(anchor);
  return { from, to: startOfDay(endOfMonth(from)) };
}

/**
 * What is coming and what came, as a tree (`MoneyTree`): money in to the left
 * of the trunk and out to the right, or one of them with the days taking turns.
 *
 * One month at a time — this one to begin with — stepped with ‹ ›. It is drawn
 * a few weeks at a time as it is scrolled (`useLoadMore`), so a busy month
 * costs no more to open than a quiet one. The items are the calendar's own
 * (`calendarItemsBetween`), so a leaf here and the same day on «Ημερολόγιο»
 * say the same.
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
  const [anchor, setAnchor] = useState(() => startOfMonth(today));
  // No further than the sources reach: past their last month the incomes,
  // loans and goals are not there to show.
  const end = useMemo(() => startOfDay(endOfMonth(last)), [last]);
  const { from, to } = useMemo(() => {
    const whole = stretch(anchor);
    return { from: whole.from, to: whole.to > end ? end : whole.to };
  }, [anchor, end]);

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
  const title = monthFmt.format(from);

  const moved = (by: number) => addMonths(startOfMonth(anchor), by);
  const step = (by: number) => setAnchor(moved(by));
  // Back as far as the sources reach; forward while the next month starts
  // inside them — its tail is cut at their last month.
  const canBack = stretch(moved(-1)).from >= first;
  const canForward = stretch(moved(1)).from <= end;
  const holdsToday = today >= from && today <= to;
  const backToToday = () => setAnchor(startOfMonth(today));

  // Drawn a few weeks at a time: the next lot on its way as the end comes into view.
  const { limit, hasMore, more, sentinel } = useLoadMore(days.length, DAYS_PAGE, `${from.getTime()}|${side}|${kinds?.join(",") ?? ""}`);
  const shown = days.slice(0, limit);

  // A calendar item as a leaf, at one of three weights. What wants doing is
  // what is late — and a payment due today, which has to go today all the same.
  //
  // The leaf is told the state as a kind and a word, not as drawn markup: the
  // tree owns the marks, and on a phone it shows the mark alone (see
  // `MoneyTree`). «!» for the day that has come, «⚠» for the day that has
  // gone — the shapes differ, as rule 14 asks.
  const toLeaf = (item: CalendarItem): TreeLeaf => {
    const daysAway = differenceInCalendarDays(item.date, today);
    const late = item.state === "late" || (item.state === "todo" && item.direction === "out" && daysAway <= 0);
    const upcoming = item.state === "todo" && !late;
    const inDays = daysAway > 0 ? t("timeline.inDays", { count: daysAway }) : undefined;
    const state: TreeLeafState = late
      ? {
          kind: item.state === "late" || daysAway < 0 ? "late" : "due",
          // Money put aside for a goal is not a bill: it goes in, today.
          word: t(item.kind === "goal" ? "timeline.state_goalToday" : item.direction === "out" ? "timeline.state_toPay" : "timeline.state_late"),
        }
      : upcoming && item.first
        ? // Not running yet: this is where it starts, said plainly.
          { kind: "first", word: t("timeline.state_first"), extra: inDays }
        : upcoming
          ? { kind: "coming", word: t("timeline.state_coming"), extra: inDays }
          : { kind: "done", word: t(item.direction === "out" ? "timeline.state_paid" : "timeline.state_came") };
    return { id: item.id, direction: item.direction, label: item.label, amount: item.amount, icon: CALENDAR_KIND_ICON[item.kind], approximate: item.approximate, done: item.state === "done", late, upcoming, state };
  };

  return (
    <section className={`card p-3 p-lg-4 ${styles.card}`} aria-label={heading}>
      <div className="stat-head">{heading}</div>

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
