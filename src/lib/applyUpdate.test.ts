import { describe, it, expect, vi } from "vitest";
import { reloadOnNewWorker } from "./applyUpdate";

// Taking the new version.
//
// The case worth writing down is the one that was silently broken: the visit
// that installed the service worker in the first place. Nothing about it looks
// different from the outside, and it is the visit a new reader is having.

const container = () => {
  const listeners: Array<() => void> = [];
  return {
    addEventListener: (_type: string, fn: EventListenerOrEventListenerObject) => listeners.push(fn as () => void),
    handover: () => listeners.forEach((fn) => fn()),
    count: () => listeners.length,
  };
};

describe("reloadOnNewWorker", () => {
  it("waits for the handover before reloading", () => {
    const sw = container();
    const reload = vi.fn();

    reloadOnNewWorker({ container: sw, reload, setTimer: () => {} });
    expect(reload).not.toHaveBeenCalled();

    sw.handover();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads anyway when no handover arrives", () => {
    // The button has to do something. The new build is on the server whether or
    // not the worker answered.
    const reload = vi.fn();
    let fallback = () => {};

    reloadOnNewWorker({ container: container(), reload, setTimer: (fn) => (fallback = fn), fallbackMs: 3000 });
    fallback();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once, whichever gets there first", () => {
    const sw = container();
    const reload = vi.fn();
    let fallback = () => {};

    reloadOnNewWorker({ container: sw, reload, setTimer: (fn) => (fallback = fn) });
    sw.handover();
    fallback();
    sw.handover();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads where there is no service worker at all", () => {
    const reload = vi.fn();
    let fallback = () => {};

    reloadOnNewWorker({ container: undefined, reload, setTimer: (fn) => (fallback = fn) });
    fallback();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
