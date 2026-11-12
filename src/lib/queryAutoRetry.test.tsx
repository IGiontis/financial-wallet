import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import i18n from "../i18n";
import { AUTO_RETRY_DELAYS, installQueryAutoRetry } from "./queryAutoRetry";

// A failed load is tried again on its own — 5, 15 and 45 seconds on, then 2, 5
// and 10 minutes — then it waits for a reconnect. Silently: the user is never
// shown a "didn't load" message or asked to try again.

let client: QueryClient;
let uninstall: () => void;
let calls = 0;
let failing = true;

function Page() {
  const q = useQuery({
    queryKey: ["things"],
    queryFn: async () => {
      calls++;
      if (failing) throw new Error("unavailable");
      return ["a"];
    },
  });
  return <div>{q.data ? "loaded" : "nothing"}</div>;
}

const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );

/** Advances fake time and lets the query's promises settle. */
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.useFakeTimers();
  calls = 0;
  failing = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  uninstall = installQueryAutoRetry(client);
});

afterEach(() => {
  uninstall();
  client.clear();
  vi.useRealTimers();
});

describe("a load that failed", () => {
  it("is tried again after 5, 15 and 45 seconds, then 2, 5 and 10 minutes, then waits", async () => {
    mount();
    await wait(0);
    expect(calls).toBe(1);

    await wait(AUTO_RETRY_DELAYS[0] - 1);
    expect(calls).toBe(1);
    await wait(1);
    expect(calls).toBe(2);
    for (const [index, delay] of AUTO_RETRY_DELAYS.slice(1).entries()) {
      await wait(delay);
      expect(calls).toBe(index + 3);
    }
    expect(AUTO_RETRY_DELAYS).toEqual([5_000, 15_000, 45_000, 120_000, 300_000, 600_000]);
    // Six tries and no more: a load refused for good must not keep spending reads.
    await wait(60 * 60_000);
    expect(calls).toBe(1 + AUTO_RETRY_DELAYS.length);
  });

  it("never shows a message, and the page fills in once a try brings the data", async () => {
    mount();
    await wait(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("nothing")).toBeInTheDocument();
    await wait(AUTO_RETRY_DELAYS[0] + AUTO_RETRY_DELAYS[1]);
    expect(calls).toBe(3);
    expect(screen.queryByRole("alert")).toBeNull();

    failing = false;
    await wait(AUTO_RETRY_DELAYS[2]);
    // React Query tells its observers a tick later.
    await wait(10);
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("after every try has failed, still says nothing — and tries again when the app comes back to the front", async () => {
    mount();
    await wait(AUTO_RETRY_DELAYS.reduce((a, b) => a + b, 0) + 10);
    expect(calls).toBe(1 + AUTO_RETRY_DELAYS.length);
    expect(screen.queryByRole("alert")).toBeNull();

    failing = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await wait(10);
    expect(calls).toBe(2 + AUTO_RETRY_DELAYS.length);
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("does not spend a try while offline, and tries as soon as the connection is back", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount();
    await wait(0);
    await wait(AUTO_RETRY_DELAYS[0] + AUTO_RETRY_DELAYS[1]);
    expect(calls).toBe(1);

    onLine.mockReturnValue(true);
    failing = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(2);
    expect(screen.getByText("loaded")).toBeInTheDocument();
    onLine.mockRestore();
  });
});
