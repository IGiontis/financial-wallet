import { describe, it, expect, vi } from "vitest";
import { APP_PAGES, pageChunks, type PageChunk } from "./pageChunks";
import { chunkForPath, prefetchAllowed, prefetchPages } from "./prefetchPages";

/** A window whose idle moments come only when the test says so. */
function idleWindow() {
  const queue: (() => void)[] = [];
  const win = {
    navigator: {},
    requestIdleCallback: (cb: () => void) => queue.push(cb),
    cancelIdleCallback: vi.fn(),
  } as never;
  return { win, queue };
}

/** One spy per chunk, each resolving at once. */
function spyChunks() {
  const calls: PageChunk[] = [];
  const chunks = Object.fromEntries(
    (Object.keys(pageChunks) as PageChunk[]).map((key) => [key, vi.fn(async () => void calls.push(key))]),
  ) as unknown as Record<PageChunk, () => Promise<unknown>>;
  return { chunks, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("prefetchAllowed", () => {
  it("says no when the reader asked to save data", () => {
    expect(prefetchAllowed({ connection: { saveData: true, effectiveType: "4g" } })).toBe(false);
  });

  it("says no on 2G and slow 2G", () => {
    expect(prefetchAllowed({ connection: { effectiveType: "2g" } })).toBe(false);
    expect(prefetchAllowed({ connection: { effectiveType: "slow-2g" } })).toBe(false);
  });

  it("says yes on 3G and 4G, and where the browser cannot say", () => {
    expect(prefetchAllowed({ connection: { effectiveType: "3g" } })).toBe(true);
    expect(prefetchAllowed({ connection: { effectiveType: "4g", saveData: false } })).toBe(true);
    expect(prefetchAllowed({})).toBe(true);
  });
});

describe("prefetchPages", () => {
  it("fetches nothing at all when the reader asked to save data", async () => {
    const { win, queue } = idleWindow();
    const { chunks, calls } = spyChunks();
    prefetchPages({ chunks, win, nav: { connection: { saveData: true } } });
    expect(queue).toHaveLength(0);
    await flush();
    expect(calls).toEqual([]);
  });

  it("fetches every app page, one per idle moment, each after the last has arrived", async () => {
    const { win, queue } = idleWindow();
    const { chunks, calls } = spyChunks();
    prefetchPages({ chunks, win, nav: {} });

    // Nothing before the browser is idle.
    expect(calls).toEqual([]);
    for (let i = 0; i < APP_PAGES.length; i++) {
      // Exactly one waiting idle callback at a time: the stagger.
      expect(queue).toHaveLength(1);
      queue.shift()!();
      await flush();
      expect(calls).toHaveLength(i + 1);
    }
    expect(queue).toHaveLength(0);
    expect(calls).toEqual([...APP_PAGES]);
  });

  it("goes on past a chunk that fails", async () => {
    const { win, queue } = idleWindow();
    const { chunks, calls } = spyChunks();
    chunks[APP_PAGES[0]] = vi.fn(async () => {
      throw new Error("offline");
    });
    prefetchPages({ chunks, win, nav: {}, pages: APP_PAGES.slice(0, 2) });
    queue.shift()!();
    await flush();
    queue.shift()!();
    await flush();
    expect(calls).toEqual([APP_PAGES[1]]);
  });

  it("stops when asked", async () => {
    const { win, queue } = idleWindow();
    const { chunks, calls } = spyChunks();
    const stop = prefetchPages({ chunks, win, nav: {} });
    stop();
    queue.shift()?.();
    await flush();
    expect(calls).toEqual([]);
  });

  it("falls back to a timer where there is no requestIdleCallback", async () => {
    vi.useFakeTimers();
    try {
      const { chunks, calls } = spyChunks();
      prefetchPages({ chunks, nav: {}, pages: ["bills"], win: { navigator: {}, setTimeout, clearTimeout } as never });
      expect(calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(400);
      expect(calls).toEqual(["bills"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the page list", () => {
  it("is every chunk of the map but signing in and the legal pages — a page added to the map is prefetched", () => {
    const outside = (Object.keys(pageChunks) as PageChunk[]).filter((key) => !APP_PAGES.includes(key));
    expect(outside.sort()).toEqual(["legal", "login", "register"]);
    expect(new Set(APP_PAGES).size).toBe(APP_PAGES.length);
  });

  it("maps a menu address to its page's chunk", () => {
    expect(chunkForPath("/")).toBe("overview");
    expect(chunkForPath("/transactions")).toBe("transactions");
    expect(chunkForPath("/transactions/new")).toBe("newTransaction");
    expect(chunkForPath("/transactions/ledger")).toBe("ledger");
    // «Ημερολόγιο συναλλαγών» sits under «Ημερολόγιο» but is the transactions
    // list's own page in another view: the same chunk, not the calendar's.
    expect(chunkForPath("/calendar")).toBe("calendar");
    expect(chunkForPath("/calendar/transactions")).toBe("transactions");
    // «Δικαιούχοι & κατηγορίες»: its own entry, two pages, one chunk.
    expect(chunkForPath("/names")).toBe("names");
    expect(chunkForPath("/names/payees")).toBe("names");
    expect(chunkForPath("/names/categories")).toBe("names");
    expect(chunkForPath("/bills/pay")).toBe("bills");
    // «Δουλειά»'s two pages are one chunk, as Πάγια's four are.
    expect(chunkForPath("/business")).toBe("business");
    expect(chunkForPath("/business/manage")).toBe("business");
    expect(chunkForPath("/business/new")).toBe("business");
    // A person's / a bank loan's page is the Debts chunk.
    expect(chunkForPath("/debts/person/nikos")).toBe("debts");
    expect(chunkForPath("/debts/loan/abc")).toBe("debts");
    expect(chunkForPath("/settings/data")).toBe("settings");
    expect(chunkForPath("/login")).toBeNull();
    expect(chunkForPath("/nowhere")).toBeNull();
  });
});
