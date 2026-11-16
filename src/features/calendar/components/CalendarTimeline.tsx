import { Skeleton } from "../../../shared/components/Skeletons";
import { PageWaiting } from "../../../shared/components/PageWaiting";
import { usePageLoad } from "../../../shared/hooks/usePageLoad";
import { useCalendarSources } from "../useCalendarSources";
import { MoneyTimeline, type TimelineSide } from "./MoneyTimeline";
import type { CalendarKind } from "../calendarDays";

/**
 * The tree, reading the calendar's sources itself — for a page («Έσοδα»,
 * «Πάγια») that has none of its own. Only mounted while the tree is the view
 * chosen, so the reads it needs are made only then.
 */
export function CalendarTimeline({ side, kinds, formatCurrency, locale }: { side: TimelineSide; kinds?: readonly CalendarKind[]; formatCurrency: (n: number) => string; locale: string }) {
  const { sources, first, last, missing } = useCalendarSources();
  // The skeleton for a few seconds at most, then a quiet line — see `usePageLoad`.
  const load = usePageLoad(missing);
  if (load === "loading") return <Skeleton height={320} />;
  if (load === "waiting") return <PageWaiting />;
  return <MoneyTimeline side={side} kinds={kinds} sources={sources} first={first} last={last} formatCurrency={formatCurrency} locale={locale} />;
}

export default CalendarTimeline;
