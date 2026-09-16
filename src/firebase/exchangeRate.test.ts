import { describe, it, expect, afterEach, vi } from "vitest";
import { convertAmount, fetchExchangeRates, readStoredRates, writeStoredRates, RATES_STORAGE_KEY } from "./exchangeRate";

// Rates are relative to USD (the pivot): 1 USD = 0.9 EUR = 0.8 GBP
const rates = { USD: 1, EUR: 0.9, GBP: 0.8 };

describe("convertAmount", () => {
  it("returns the same amount when from === to", () => {
    expect(convertAmount(100, "EUR", "EUR", rates)).toBe(100);
  });

  it("converts USD → EUR by multiplying by the target rate", () => {
    expect(convertAmount(100, "USD", "EUR", rates)).toBeCloseTo(90);
  });

  it("converts EUR → USD by dividing by the source rate", () => {
    expect(convertAmount(90, "EUR", "USD", rates)).toBeCloseTo(100);
  });

  it("converts EUR → GBP through the USD pivot", () => {
    // 90 EUR -> 100 USD -> 80 GBP
    expect(convertAmount(90, "EUR", "GBP", rates)).toBeCloseTo(80);
  });

  it("is reversible (round-trips back to the original)", () => {
    const there = convertAmount(250, "GBP", "EUR", rates);
    const back = convertAmount(there, "EUR", "GBP", rates);
    expect(back).toBeCloseTo(250);
  });

  it("falls back to a rate of 1 when a currency is missing", () => {
    expect(convertAmount(100, "USD", "JPY", rates)).toBe(100);
  });
});

// ─── Fetching ────────────────────────────────────────────────────────────────
// One bad rate multiplies every figure on every screen, so what happens when
// the call goes wrong matters as much as what happens when it works. The rule
// is the same throughout: throw, and let the caller keep the last good rates,
// rather than return something that looks like a rate and is not.

describe("fetchExchangeRates", () => {
  const respondWith = (body: unknown, ok = true) =>
    vi.fn().mockResolvedValue({ ok, json: async () => body } as unknown as Response);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the rates against the dollar", async () => {
    vi.stubGlobal("fetch", respondWith({ result: "success", conversion_rates: { EUR: 0.92, GBP: 0.79 } }));

    await expect(fetchExchangeRates()).resolves.toEqual({ base: "USD", rates: { EUR: 0.92, GBP: 0.79 } });
  });

  it("asks the dollar endpoint, once", async () => {
    const fetcher = respondWith({ result: "success", conversion_rates: { EUR: 0.92 } });
    vi.stubGlobal("fetch", fetcher);

    await fetchExchangeRates();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/latest\/USD$/);
  });

  it("throws rather than returning half an answer when the request fails", async () => {
    vi.stubGlobal("fetch", respondWith({}, false));

    await expect(fetchExchangeRates()).rejects.toThrow("Failed to fetch exchange rates");
  });

  it("passes the provider's own complaint through", async () => {
    // A 200 that says "invalid-key" is still a failure, and the reason is worth
    // keeping: it is the difference between a dead key and a dead network.
    vi.stubGlobal("fetch", respondWith({ result: "error", "error-type": "invalid-key" }));

    await expect(fetchExchangeRates()).rejects.toThrow("invalid-key");
  });

  it("still fails loudly when the provider says nothing useful", async () => {
    vi.stubGlobal("fetch", respondWith({ result: "error" }));

    await expect(fetchExchangeRates()).rejects.toThrow("Exchange rate error");
  });

  it("does not swallow a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(fetchExchangeRates()).rejects.toThrow("offline");
  });
});

// ─── The same figure, reached another way ────────────────────────────────────

describe("conversions that must agree with each other", () => {
  const rates = { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 };
  const currencies = ["USD", "EUR", "GBP", "JPY"] as const;

  it("comes back to where it started, whichever pair it goes through", () => {
    for (const from of currencies) {
      for (const to of currencies) {
        const there = convertAmount(1234.56, from, to, rates);
        const back = convertAmount(there, to, from, rates);

        expect(back, `${from}->${to}`).toBeCloseTo(1234.56, 6);
      }
    }
  });

  it("gets the same answer going direct as going through a third currency", () => {
    for (const from of currencies) {
      for (const to of currencies) {
        const direct = convertAmount(500, from, to, rates);
        const viaJpy = convertAmount(convertAmount(500, from, "JPY", rates), "JPY", to, rates);

        expect(viaJpy, `${from}->${to}`).toBeCloseTo(direct, 6);
      }
    }
  });

  it("scales in a straight line, so twice the money is twice the money", () => {
    expect(convertAmount(200, "EUR", "GBP", rates)).toBeCloseTo(2 * convertAmount(100, "EUR", "GBP", rates), 10);
    expect(convertAmount(0, "EUR", "GBP", rates)).toBe(0);
    expect(convertAmount(-100, "EUR", "GBP", rates)).toBeCloseTo(-convertAmount(100, "EUR", "GBP", rates), 10);
  });

  it("leaves an amount alone when the currency is one it has no rate for", () => {
    // Documented, and a hazard worth knowing: an unknown currency converts 1:1
    // rather than failing, so a missing rate reads as "the same number".
    expect(convertAmount(100, "EUR", "XXX", rates)).toBeCloseTo(100 / 0.9, 6);
    expect(convertAmount(100, "XXX", "EUR", rates)).toBeCloseTo(90, 6);
  });
});

// ─── Rates that survive the app closing ──────────────────────────────────────
//
// With no connection there used to be no rates at all, and `convert` answers
// that by handing the amount straight back. Where the display currency differs
// from the base one, that turns every figure on every screen into an
// unconverted number with nothing on the page to say so. These pin down the
// stored copy that stands in for a fetch — and, just as importantly, that it
// refuses anything it cannot fully trust, because a wrong rate is worse than
// none.

const store = (initial?: string) => {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    read: () => value,
  };
};

describe("storing the last rates", () => {
  it("reads back what it wrote", () => {
    const s = store();
    writeStoredRates({ base: "USD", rates: { EUR: 0.9, GBP: 0.8 } }, 1_700_000_000_000, s);

    expect(readStoredRates(s)).toEqual({ base: "USD", rates: { EUR: 0.9, GBP: 0.8 }, fetchedAt: 1_700_000_000_000 });
  });

  it("writes under a key of its own", () => {
    const s = store();
    let key = "";
    writeStoredRates({ base: "USD", rates: { EUR: 0.9 } }, 1, { setItem: (k: string) => (key = k) });

    expect(key).toBe(RATES_STORAGE_KEY);
    expect(readStoredRates(s)).toBeUndefined();
  });

  it("has nothing to say on a device that has never been online", () => {
    expect(readStoredRates(store())).toBeUndefined();
  });

  it("throws away anything it cannot read as rates", () => {
    expect(readStoredRates(store("not json"))).toBeUndefined();
    expect(readStoredRates(store("null"))).toBeUndefined();
    expect(readStoredRates(store('{"base":"USD","rates":{"EUR":0.9}}'))).toBeUndefined(); // no timestamp
    expect(readStoredRates(store('{"base":"USD","fetchedAt":1,"rates":{}}'))).toBeUndefined(); // nothing in it
    expect(readStoredRates(store('{"base":"","fetchedAt":1,"rates":{"EUR":0.9}}'))).toBeUndefined();
  });

  it("throws away a rate that would convert the wrong way", () => {
    // Zero divides to Infinity and a negative flips the sign — both would read
    // as a number rather than as a failure.
    expect(readStoredRates(store('{"base":"USD","fetchedAt":1,"rates":{"EUR":0}}'))).toBeUndefined();
    expect(readStoredRates(store('{"base":"USD","fetchedAt":1,"rates":{"EUR":-0.9}}'))).toBeUndefined();
    expect(readStoredRates(store('{"base":"USD","fetchedAt":1,"rates":{"EUR":"0.9"}}'))).toBeUndefined();
    expect(readStoredRates(store('{"base":"USD","fetchedAt":1,"rates":{"EUR":0.9,"GBP":null}}'))).toBeUndefined();
  });

  it("says nothing rather than throwing when storage is closed to it", () => {
    expect(
      readStoredRates({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBeUndefined();

    expect(() =>
      writeStoredRates({ base: "USD", rates: { EUR: 0.9 } }, 1, {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).not.toThrow();
  });

  it("keeps a copy every time a fetch succeeds", async () => {
    const stored: Record<string, string> = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => void (stored[k] = v) });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "success", conversion_rates: { USD: 1, EUR: 0.9 } }) }),
    );

    await fetchExchangeRates();

    expect(readStoredRates()).toMatchObject({ base: "USD", rates: { USD: 1, EUR: 0.9 } });
    vi.unstubAllGlobals();
  });
});
