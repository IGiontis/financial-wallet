import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { OUTGOING_COLOURS } from "../../overview/components/paydayParts";
import { sliceBar, sliceScale, sliceSteps, type PlanSlice } from "../payCycles";
import { SALARY_ROW_ID } from "../plannerUtils";
import CycleSteps from "./CycleSteps";
import styles from "../css/PlannerPage.module.css";

/**
 * Rows drawn before the rest wait behind a button: a year of pay days and the
 * one after it. Only past a year and a quarter — a year's view seen from mid-
 * month holds fourteen rows, and one row behind a button is a button for
 * nothing.
 */
const FIRST_ROWS = 13;
const FOLD_ABOVE = 16;

interface PayCycleChartProps {
  slices: PlanSlice[];
  /** One line per row, for a window of a year or more. */
  compact: boolean;
  today: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  onOccurrence?: (key: string) => void;
}

/**
 * Pay-cycle envelopes: one bar for each pay, and where it goes.
 *
 * Each bar is everything there is on pay day — what was left from the last
 * one, with a green rule over the part that is the pay itself. The outgoings
 * leave from the right, in the colours the Overview's bar uses for them, and
 * whatever is still standing on zero at the end is the evening before the next
 * pay: the figure printed in the column on the right, and the one the page
 * exists to answer.
 *
 * It replaced a line of the daily balance. The line was right, and kept its
 * answers to itself: the low before each pay was a point to find with a
 * finger, the bills were unnamed dots, and from a year up it was a saw-tooth.
 * Here the eves are a column of figures read without touching anything, the
 * horizon only adds rows, and a cycle that ends lower than the one before is
 * marked where the eye already is.
 *
 * Plain HTML rather than SVG: each row is a button, which is what a tap
 * target that opens something should be, and the text sits at the size the
 * page sets rather than whatever a stretched drawing makes of it.
 */
export function PayCycleChart({ slices, compact, today, formatCurrency, locale, onOccurrence }: PayCycleChartProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const months = slices[0]?.kind === "month";

  const formats = useMemo(
    () => ({
      exact: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      whole: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
      day: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      dayLong: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }),
      month: new Intl.DateTimeFormat(locale, { month: "short" }),
      monthLong: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    }),
    [locale],
  );

  // Over every row, shown or not, so opening the rest never rescales the ones already read.
  const scale = useMemo(() => sliceScale(slices), [slices]);
  const x = (value: number) => ((value - scale.min) / (scale.max - scale.min)) * 100;

  if (slices.length === 0) return null;
  const current = slices[Math.min(selected, slices.length - 1)];
  const shown = slices.length > FOLD_ABOVE && !showAll ? slices.slice(0, FIRST_ROWS) : slices;
  const hidden = slices.slice(shown.length);

  const amount = (n: number, exact: boolean) => `${n < 0 ? "−" : ""}${(exact ? formats.exact : formats.whole).format(Math.abs(n))}`;
  // Greek month names are inflected: the long form alone is the genitive,
  // right inside a date and wrong as a heading. With the year, Intl gives the
  // nominative, so the name is pulled back out of that.
  const monthName = (date: Date) => formats.monthLong.formatToParts(date).find((p) => p.type === "month")?.value ?? "";

  const range = (slice: PlanSlice) => {
    if (slice.from === 0) return t("planner.cycleFromToday", { end: formats.day.format(slice.end) });
    if (slice.kind === "month") return monthName(slice.start) + (slice.start.getFullYear() !== today.getFullYear() ? ` ${slice.start.getFullYear()}` : "");
    if (slice.days === 1) return formats.day.format(slice.start);
    return `${formats.day.format(slice.start)} → ${formats.day.format(slice.end)}`;
  };

  // The short name of the row in a compact chart: the eve it ends on, or the month.
  const shortName = (slice: PlanSlice) => (slice.kind === "month" ? formats.month.format(slice.start) : formats.day.format(slice.end));

  const value = (slice: PlanSlice, exact: boolean) => {
    const figure = amount(slice.close, exact);
    if (slice.close < 0) return `⚠ ${figure}`;
    if (slice.last) return t("planner.cycleEnd", { amount: figure });
    return slice.backwards ? `▼ ${figure}` : figure;
  };

  /** "Out on 1, 5, 8, 10 Oct · pay 30 Oct" — the days, grouped by month, in the locale's order of day and month. */
  const caption = (slice: PlanSlice, index: number) => {
    const days: Date[] = [];
    for (const event of slice.items) if (event.amount < 0 && !days.some((d) => d.getTime() === event.date.getTime())) days.push(event.date);
    const groups: Date[][] = [];
    for (const date of days) {
      const last = groups.at(-1);
      if (last && last[0].getMonth() === date.getMonth()) last.push(date);
      else groups.push([date]);
    }
    const written = groups.map((group) => {
      const parts = formats.day.formatToParts(group.at(-1)!);
      const month = parts.find((p) => p.type === "month")?.value ?? "";
      const numbers = group.map((d) => d.getDate()).join(", ");
      return parts.findIndex((p) => p.type === "day") < parts.findIndex((p) => p.type === "month") ? `${numbers} ${month}` : `${month} ${numbers}`;
    });
    const nextPay = slices[index + 1]?.payEvents.find((e) => e.label === SALARY_ROW_ID);
    return [written.length ? t("planner.cycleLeaves", { days: written.join(", ") }) : "", nextPay ? t("planner.cycleNextPay", { date: formats.day.format(nextPay.date) }) : ""].filter(Boolean).join(" · ");
  };

  const span = (from: number, to: number): CSSProperties => ({ left: `${x(Math.min(from, to))}%`, width: `${Math.abs(x(to) - x(from))}%` });

  const bar = (slice: PlanSlice) => {
    const geometry = sliceBar(slice);
    const parts = [
      { key: "left", amount: geometry.left, colour: OUTGOING_COLOURS.left },
      { key: "lines", amount: slice.lines, colour: OUTGOING_COLOURS.lines },
      { key: "commitments", amount: slice.commitments, colour: OUTGOING_COLOURS.commitments },
      { key: "bills", amount: slice.bills, colour: OUTGOING_COLOURS.bills },
    ].filter((part) => part.amount > 0);
    return (
      <span className={styles.cycleTrack} aria-hidden>
        {!compact && slice.pay > 0 && <span className={styles.cyclePayRule} style={span(geometry.payFrom, geometry.payTo)} />}
        {geometry.high > geometry.low && (
          <span className={styles.cycleBar} style={span(geometry.low, geometry.high)}>
            {parts.map((part) => (
              <i key={part.key} style={{ flexGrow: part.amount, background: part.colour }} />
            ))}
          </span>
        )}
        {/* Under zero is never colour alone: hatched, and underlined. */}
        {slice.close < 0 && <span className={styles.cycleUnder} style={span(slice.close, 0)} />}
      </span>
    );
  };

  const titles = months
    ? [t(compact ? "planner.chartMonthShort" : "planner.chartTitleMonths"), t(compact ? "planner.chartEndShort" : "planner.chartValueMonths")]
    : [t(compact ? "planner.chartEveShort" : "planner.chartTitle"), t(compact ? "planner.chartLeftShort" : "planner.chartValue")];

  return (
    <div className={`${styles.cycles} ${compact ? styles.cyclesCompact : ""}`}>
      <div className={styles.cycleHead}>
        <span>{titles[0]}</span>
        <span>{titles[1]}</span>
      </div>

      <div className={styles.cycleRows} role="list" aria-label={t("planner.chartAria")}>
        <div className={styles.cycleGrid} aria-hidden>
          {scale.ticks.map((tick) => (
            <span key={tick} className={tick === 0 ? styles.cycleZero : undefined} style={{ left: `${x(tick)}%` }} />
          ))}
        </div>

        {shown.map((slice, index) => {
          const isSelected = slice === current;
          const under = slice.breaksOn
            ? slice.breaksAt
              ? t("planner.cycleUnderAt", { date: formats.dayLong.format(slice.breaksOn), name: slice.breaksAt.label === SALARY_ROW_ID ? t("planner.salaryLabel") : slice.breaksAt.label })
              : t("planner.cycleUnder", { date: formats.dayLong.format(slice.breaksOn) })
            : undefined;
          const tone = slice.close < 0 ? styles.cycleNegative : "";

          return (
            <div role="listitem" key={slice.from}>
              <button type="button" className={`${styles.cycleRow} ${isSelected ? styles.cycleSelected : ""}`} aria-pressed={isSelected} onClick={() => setSelected(index)}>
                {compact ? (
                  <>
                    <span className={styles.cycleWhen}>{shortName(slice)}</span>
                    {bar(slice)}
                    <span className={`${styles.cycleValue} ${tone}`}>{value(slice, false)}</span>
                  </>
                ) : (
                  <>
                    <span className={styles.cycleTop}>
                      <span className={styles.cycleWhen}>
                        {range(slice)}
                        {slice.pay > 0 && <span className={styles.cyclePay}> +{amount(slice.pay, false)}</span>}
                      </span>
                      <span className={`${styles.cycleValue} ${tone}`}>{value(slice, true)}</span>
                    </span>
                    {bar(slice)}
                    {isSelected && caption(slice, index) && <span className={styles.cycleCaption}>{caption(slice, index)}</span>}
                    {under && <span className={styles.cycleWarn}>⚠ {under}</span>}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.cycleAxis} aria-hidden>
        {scale.ticks.map((tick) => (
          <span key={tick} style={{ left: `${x(tick)}%` }}>
            {amount(tick, false)}
          </span>
        ))}
      </div>

      {hidden.length > 0 && (
        <button type="button" className={styles.cycleMore} onClick={() => setShowAll(true)}>
          {t("planner.moreEvents", { count: hidden.length })}
          {hidden.some((slice) => slice.close < 0 || slice.breaksOn) ? " · ⚠" : ""}
        </button>
      )}

      {/* What the tapped row is made of, under the chart where the hand is not. */}
      <div className={styles.cycleReadout} aria-live="polite">
        <div className={styles.cycleReadoutHead}>{range(current)}</div>
        <div className={styles.cycleReadoutMain}>
          <span>{t(current.last ? "planner.readoutEnd" : months ? "planner.readoutMonthEnd" : "planner.readoutEve")}</span>
          <strong className={current.close < 0 ? styles.cycleNegative : undefined}>{formatCurrency(current.close)}</strong>
        </div>
        <CycleSteps
          label={range(current)}
          steps={sliceSteps(current)}
          days={current.days}
          first={current.from === 0}
          today={today}
          onOccurrence={onOccurrence}
          formatCurrency={formatCurrency}
          locale={locale}
        />
      </div>
    </div>
  );
}

export default PayCycleChart;
