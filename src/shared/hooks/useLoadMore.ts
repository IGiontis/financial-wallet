import { useEffect, useRef, useState } from "react";

/**
 * A long list drawn a page at a time, the next page on its way as the end
 * comes into view.
 *
 * The rows are all in memory already — the records are read once and kept —
 * so what this saves is the drawing: a year of the ledger is a few thousand
 * rows, and drawing every one of them at once is what made the page heavy
 * on a phone. A sentinel just below the last row asks for the next page a
 * screen before it is reached, so scrolling never meets the end.
 *
 * `resetKey` starts it over: a new filter is a new list, read from its top.
 */
export function useLoadMore(total: number, page: number, resetKey: unknown) {
  const [limit, setLimit] = useState(page);
  const [lastKey, setLastKey] = useState(resetKey);
  // A different list: back to the first page — set during render, the way
  // React means state derived from a prop to be reset, not in an effect after it.
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setLimit(page);
  }

  const sentinel = useRef<HTMLDivElement | null>(null);
  const hasMore = total > limit;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    // A screen early, so the next page is there before the thumb gets to it.
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setLimit((l) => l + page), { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, page, limit]);

  return { limit, hasMore, more: () => setLimit((l) => l + page), sentinel };
}
