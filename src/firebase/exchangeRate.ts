// Fetches exchange rates from exchangerate-api.com
// Rates are relative to USD — e.g. { EUR: 0.92, GBP: 0.79 }
// Cached for 1 hour via TanStack Query — only 1 API call per session

const API_KEY = import.meta.env.VITE_EXCHANGE_RATE_API_KEY;
const BASE = "USD";

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
}

/**
 * The last rates that came back, kept where they survive the app closing.
 *
 * Query's cache is per session, so with no connection there were no rates at
 * all — and `convert` answers that by handing back the amount unchanged. For
 * anyone whose display currency matches their base that is invisible. For
 * anyone else it means every figure on every screen quietly stops being
 * converted, with nothing on the page to say so: €1,000 of savings reading as
 * £1,000. Rates from yesterday are a far better answer than that, as long as
 * the screen is willing to admit how old they are.
 */
export const RATES_STORAGE_KEY = "myfiwallet:exchange-rates";

export interface StoredRates extends ExchangeRates {
  /** When the fetch that produced them succeeded. */
  fetchedAt: number;
}

/** Rates are money. Anything that is not exactly the expected shape is discarded. */
export const readStoredRates = (storage: Pick<Storage, "getItem"> = localStorage): StoredRates | undefined => {
  let raw: string | null = null;
  try {
    raw = storage.getItem(RATES_STORAGE_KEY);
  } catch {
    return undefined; // Storage switched off. No rates is the honest answer.
  }
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;

    const { base, rates, fetchedAt } = parsed as Partial<StoredRates>;
    if (typeof base !== "string" || !base) return undefined;
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return undefined;
    if (typeof rates !== "object" || rates === null) return undefined;

    const entries = Object.entries(rates);
    if (entries.length === 0) return undefined;
    // A zero or a negative would divide the wrong way round rather than fail.
    if (!entries.every(([code, rate]) => typeof code === "string" && typeof rate === "number" && Number.isFinite(rate) && rate > 0)) return undefined;

    return { base, rates: rates as Record<string, number>, fetchedAt };
  } catch {
    return undefined;
  }
};

export const writeStoredRates = (data: ExchangeRates, now: number, storage: Pick<Storage, "setItem"> = localStorage): void => {
  try {
    storage.setItem(RATES_STORAGE_KEY, JSON.stringify({ ...data, fetchedAt: now }));
  } catch {
    // Full, or private mode. Losing the copy costs nothing this session.
  }
};

export const fetchExchangeRates = async (): Promise<ExchangeRates> => {
  const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE}`);
  if (!res.ok) throw new Error("Failed to fetch exchange rates");
  const data = await res.json();
  if (data.result !== "success") throw new Error(data["error-type"] ?? "Exchange rate error");

  const rates = { base: BASE, rates: data.conversion_rates };
  writeStoredRates(rates, Date.now());
  return rates;
};

// ─── Convert amount between two currencies ────────────────────────────────────
// All conversions go through USD as the pivot currency.

export const convertAmount = (amount: number, from: string, to: string, rates: Record<string, number>): number => {
  if (from === to) return amount;
  // Convert from → USD first, then USD → to
  const toUSD = from === "USD" ? amount : amount / (rates[from] ?? 1);
  const toTarget = to === "USD" ? toUSD : toUSD * (rates[to] ?? 1);
  return toTarget;
};
