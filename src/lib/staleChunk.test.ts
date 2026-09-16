import { describe, it, expect, vi } from "vitest";
import { isStaleChunkError, reloadForNewVersion, installStaleChunkRecovery, RELOAD_KEY, RELOAD_GUARD_MS } from "./staleChunk";

// Surviving a deploy that lands while the app is open.
//
// The two things worth pinning down: that the failure is recognised in the
// words each browser actually uses for it, and that the reload it triggers can
// happen once and not twice — a page that reloads itself on every error is a
// worse failure than the one it was trying to fix.

const storage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    read: (key: string) => map.get(key) ?? null,
  };
};

describe("recognising a chunk that no longer exists", () => {
  it("knows it by each browser's own wording", () => {
    expect(isStaleChunkError(new Error("Failed to fetch dynamically imported module: https://x/assets/BillsPage-abc.js"))).toBe(true);
    expect(isStaleChunkError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/BillsPage-abc.css"))).toBe(true);
  });

  it("knows it by what the SPA rewrite turns it into", () => {
    // The file is gone, so the server answers with index.html and a 200. The
    // browser complains about the type, never about the 404.
    expect(isStaleChunkError(new Error('Expected a JavaScript module script but the server responded with a MIME type of "text/html".'))).toBe(true);
  });

  it("leaves an ordinary failure alone", () => {
    expect(isStaleChunkError(new Error("Missing or insufficient permissions."))).toBe(false);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError({ message: "failed to fetch dynamically imported module" })).toBe(false);
  });
});

describe("reloading onto the new version", () => {
  it("reloads, and remembers that it did", () => {
    const store = storage();
    const reload = vi.fn();

    expect(reloadForNewVersion({ storage: store, now: () => 1_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.read(RELOAD_KEY)).toBe("1000");
  });

  it("refuses the second one, so a real failure cannot loop", () => {
    // The page came back and broke again straight away: reloading is not the
    // answer and the error should be allowed to reach the screen.
    const store = storage({ [RELOAD_KEY]: "1000" });
    const reload = vi.fn();

    expect(reloadForNewVersion({ storage: store, now: () => 1_000 + RELOAD_GUARD_MS - 1, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("allows the next deploy, which is minutes away at least", () => {
    const store = storage({ [RELOAD_KEY]: "1000" });
    const reload = vi.fn();

    expect(reloadForNewVersion({ storage: store, now: () => 1_000 + RELOAD_GUARD_MS, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stays put when it cannot remember anything", () => {
    // Private mode, storage switched off. Without somewhere to write the flag
    // every load would reload again, which is the loop.
    const reload = vi.fn();
    const blind = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };

    expect(reloadForNewVersion({ storage: blind, now: () => 1_000, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("the listener", () => {
  const preloadError = () => new Event("vite:preloadError", { cancelable: true });

  it("takes the error out of the way of the reload", () => {
    const reload = vi.fn();
    const stop = installStaleChunkRecovery({ storage: storage(), now: () => 1_000, reload });

    const event = preloadError();
    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    // Cancelled: Vite rethrows it otherwise, and the screen it would land on is
    // about to be replaced anyway.
    expect(event.defaultPrevented).toBe(true);
    stop();
  });

  it("lets the error through when it will not reload", () => {
    const reload = vi.fn();
    const stop = installStaleChunkRecovery({ storage: storage({ [RELOAD_KEY]: "1000" }), now: () => 1_000, reload });

    const event = preloadError();
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it("stops listening when told to", () => {
    const reload = vi.fn();
    const stop = installStaleChunkRecovery({ storage: storage(), now: () => 1_000, reload });
    stop();

    window.dispatchEvent(preloadError());

    expect(reload).not.toHaveBeenCalled();
  });
});
