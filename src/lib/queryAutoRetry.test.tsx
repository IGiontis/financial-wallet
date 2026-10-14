import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import i18n from "../i18n";
import { AUTO_RETRY_DELAYS, installQueryAutoRetry } from "./queryAutoRetry";
import { LoadErrorBar } from "../shared/components/LoadErrorBar";

// A failed load is tried again on its own: 5, 15 and 45 seconds on, then it
// waits — and the bar says so meanwhile, and goes once the data is in.

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
      <LoadErrorBar />
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
  it("is tried again after 5, 15 and 45 seconds, then waits", async () => {
    mount();
    await wait(0);
    expect(calls).toBe(1);

    await wait(AUTO_RETRY_DELAYS[0] - 1);
    expect(calls).toBe(1);
    await wait(1);
    expect(calls).toBe(2);
    await wait(AUTO_RETRY_DELAYS[1]);
    expect(calls).toBe(3);
    await wait(AUTO_RETRY_DELAYS[2]);
    expect(calls).toBe(4);
    // Three tries and no more: a load refused for good must not keep spending reads.
    await wait(10 * 60_000);
    expect(calls).toBe(4);
  });

  it("shows the bar while it has failed, and drops it once the data is in", async () => {
    mount();
    await wait(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Some data didn't load");

    failing = false;
    await wait(AUTO_RETRY_DELAYS[0]);
    // React Query tells its observers a tick later.
    await wait(10);
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tries at once from «Try now»", async () => {
    mount();
    await wait(0);
    failing = false;
    await act(async () => {
      screen.getByRole("button", { name: /Try now/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(2);
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
