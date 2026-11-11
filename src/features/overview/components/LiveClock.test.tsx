import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { LiveClock } from "./LiveClock";

// The Overview's ticking clock: only the clock re-renders each second, it
// stops while the tab is hidden and is right again the moment it is back.

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 3, 6, 55, 22, 400));
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
});
afterEach(() => {
  vi.useRealTimers();
});

const setHidden = (value: boolean) =>
  act(() => {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  });

describe("LiveClock", () => {
  it("shows 24-hour time with seconds in Greek and the locale's own in English", () => {
    vi.setSystemTime(new Date(2026, 10, 3, 17, 23, 55));
    const { unmount } = render(<LiveClock locale="el" />);
    expect(screen.getByText("17:23:55")).toBeInTheDocument();
    unmount();
    render(<LiveClock locale="en" />);
    expect(screen.getByText(/^5:23:55\sPM$/)).toBeInTheDocument();
  });

  it("ticks every second without re-rendering the page around it", () => {
    // Counted by React's own Profiler: every commit of the page, not of the clock alone.
    const pageRenders = vi.fn();
    const Page = () => (
      <p>
        Tuesday, November 3 · <LiveClock locale="el" />
      </p>
    );
    const PageBody = vi.fn(Page);
    render(
      <Profiler id="page" onRender={pageRenders}>
        <PageBody />
      </Profiler>,
    );
    expect(screen.getByText("06:55:22")).toBeInTheDocument();

    // Lined up to the turn of the second, then once a second.
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByText("06:55:23")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("06:55:26")).toBeInTheDocument();

    // The page's body ran once; the commits since were the clock's own.
    expect(PageBody).toHaveBeenCalledTimes(1);
    expect(pageRenders.mock.calls.filter(([, phase]) => phase === "mount")).toHaveLength(1);
  });

  it("stops while the tab is hidden and is right again on return", () => {
    render(<LiveClock locale="el" />);
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByText("06:55:23")).toBeInTheDocument();

    setHidden(true);
    // No timers left running while hidden.
    expect(vi.getTimerCount()).toBe(0);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText("06:55:23")).toBeInTheDocument();

    setHidden(false);
    expect(screen.getByText("06:56:23")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByText("06:56:24")).toBeInTheDocument();
  });

  it("leaves no timer behind when it goes", () => {
    const { unmount } = render(<LiveClock locale="el" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
