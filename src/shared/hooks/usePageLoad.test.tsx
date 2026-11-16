import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SKELETON_MAX_MS, noAnswerYet, usePageLoad } from "./usePageLoad";
import { AUTO_RETRY_DELAYS, installQueryAutoRetry } from "../../lib/queryAutoRetry";

// The owner's report (2026-11-12): some pages showed their skeleton for ever.
// The agreed rule: the skeleton for `SKELETON_MAX_MS` at most, then the page's
// natural state — and the page fills in when the data comes. Each way a load
// used to keep the skeleton open (or show a false «nothing here») is played
// here against the real TanStack query, under fake time.

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const uninstall = installQueryAutoRetry(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, uninstall, wrapper };
}

/** A query and the page's load decided from it, as every page does. */
function usePage(queryFn: () => Promise<string[]>) {
  const query = useQuery({ queryKey: ["list"], queryFn });
  const load = usePageLoad(noAnswerYet(query));
  // Read during render, so TanStack (which re-renders only for the fields a
  // component reads) keeps these current for the test's checks.
  const { data, isError, isLoading } = query;
  return { query: { data, isError, isLoading }, load };
}

/** A promise settled from outside — a read that answers when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SKELETON_MAX_MS", () => {
  it("is the owner's 8 seconds, one constant", () => {
    expect(SKELETON_MAX_MS).toBe(8_000);
  });
});

describe("noAnswerYet", () => {
  it("is true only for a query with nothing to show: never answered, or only failed", () => {
    expect(noAnswerYet({ data: undefined })).toBe(true);
    expect(noAnswerYet({ data: [] })).toBe(false); // a genuinely empty account
    expect(noAnswerYet({ data: ["a"] }, { data: undefined })).toBe(true); // one of several missing
    expect(noAnswerYet(undefined, null)).toBe(false); // nothing asked for
  });

  it("takes a data hook's own word when its `data` is always filled", () => {
    // `useInvestmentGoals` answers `[]` until both its lists have come.
    expect(noAnswerYet({ data: [], missing: true })).toBe(true);
    expect(noAnswerYet({ data: [], missing: false })).toBe(false);
  });
});

describe("usePageLoad", () => {
  it("is ready at once when nothing is missing", () => {
    const { result } = renderHook(() => usePageLoad(false));
    expect(result.current).toBe("ready");
  });

  it("shows the skeleton for SKELETON_MAX_MS at most, then waits quietly", async () => {
    const { result } = renderHook(() => usePageLoad(true));
    expect(result.current).toBe("loading");
    await advance(SKELETON_MAX_MS - 1);
    expect(result.current).toBe("loading");
    await advance(1);
    expect(result.current).toBe("waiting");
  });

  it("turns ready the moment the data comes, before or after the wait", async () => {
    const { result, rerender } = renderHook(({ missing }) => usePageLoad(missing), { initialProps: { missing: true } });
    await advance(SKELETON_MAX_MS * 3);
    expect(result.current).toBe("waiting");
    rerender({ missing: false });
    expect(result.current).toBe("ready");
  });
});

describe("a page's load against a real query", () => {
  it("a read that never answers (a phone waiting on its App Check token): skeleton, then waiting — then the data when it comes", async () => {
    const { wrapper, uninstall } = setup();
    const read = deferred<string[]>();
    const { result } = renderHook(() => usePage(() => read.promise), { wrapper });

    expect(result.current.load).toBe("loading");
    await advance(SKELETON_MAX_MS);
    expect(result.current.load).toBe("waiting");
    // Still nothing much later: still waiting, never an empty «ready».
    await advance(10 * 60_000);
    expect(result.current.load).toBe("waiting");

    read.resolve(["rent"]);
    await advance(0);
    expect(result.current.load).toBe("ready");
    expect(result.current.query.data).toEqual(["rent"]);
    uninstall();
  });

  it("a read that fails and is retried: never «ready» with nothing (TanStack's isLoading turned false here), the data when a retry gets through", async () => {
    const { wrapper, uninstall } = setup();
    let calls = 0;
    const queryFn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("unavailable");
      return ["salary"];
    });
    const { result } = renderHook(() => usePage(queryFn), { wrapper });

    await advance(10);
    // Failed once: the old pages read `isLoading` (false now) and drew «nothing here».
    expect(result.current.query.isError).toBe(true);
    expect(result.current.query.isLoading).toBe(false);
    expect(result.current.load).toBe("loading");

    // First automatic retry at 5 s fails again — still the skeleton, under 8 s.
    await advance(AUTO_RETRY_DELAYS[0] - 10);
    expect(calls).toBe(2);
    expect(result.current.load).toBe("loading");

    await advance(SKELETON_MAX_MS - AUTO_RETRY_DELAYS[0]);
    // 8 s from opening (10 ms + 4 990 ms + 3 000 ms).
    expect(result.current.load).toBe("waiting");

    // The second retry (15 s later) gets through: the page fills in by itself.
    await advance(AUTO_RETRY_DELAYS[1]);
    expect(calls).toBe(3);
    expect(result.current.load).toBe("ready");
    expect(result.current.query.data).toEqual(["salary"]);
    uninstall();
  });

  it("a genuinely empty account is ready as soon as the read answers [] — the invitation, not a skeleton", async () => {
    const { wrapper, uninstall } = setup();
    const { result } = renderHook(() => usePage(async () => []), { wrapper });
    await advance(0);
    expect(result.current.load).toBe("ready");
    expect(result.current.query.data).toEqual([]);
    uninstall();
  });

  it("a list shown before and failing to refresh stays on screen — the cache is what it shows", async () => {
    const { wrapper, client, uninstall } = setup();
    client.setQueryData(["list"], ["kept"]);
    const { result } = renderHook(() => usePage(async () => Promise.reject(new Error("unavailable"))), { wrapper });
    await advance(10);
    expect(result.current.query.isError).toBe(true);
    expect(result.current.load).toBe("ready");
    expect(result.current.query.data).toEqual(["kept"]);
    uninstall();
  });
});
