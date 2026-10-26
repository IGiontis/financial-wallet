import { Skeleton } from "../../../shared/components/Skeletons";
import { useCalendarSources } from "../useCalendarSources";
import { MoneyTimeline, type TimelineSide } from "./MoneyTimeline";

/**
 * The tree, reading the calendar's sources itself — for a page («Έσοδα»,
 * «Πάγια») that has none of its own. Only mounted while the tree is the view
 * chosen, so the reads it needs are made only then.
 */
export function CalendarTimeline({ side, formatCurrency, locale }: { side: TimelineSide; formatCurrency: (n: number) => string; locale: string }) {
  const { sources, first, last, isLoading } = useCalendarSources();
  if (isLoading) return <Skeleton height={320} />;
  return <MoneyTimeline side={side} sources={sources} first={first} last={last} formatCurrency={formatCurrency} locale={locale} />;
}

export default CalendarTimeline;
