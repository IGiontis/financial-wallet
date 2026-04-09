// Fetches exchange rates from exchangerate-api.com
// Rates are relative to USD — e.g. { EUR: 0.92, GBP: 0.79 }
// Cached for 1 hour via TanStack Query — only 1 API call per session

const API_KEY = import.meta.env.VITE_EXCHANGE_RATE_API_KEY;
const BASE = "USD";

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
}

export const fetchExchangeRates = async (): Promise<ExchangeRates> => {
  const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE}`);
  if (!res.ok) throw new Error("Failed to fetch exchange rates");
  const data = await res.json();
  if (data.result !== "success") throw new Error(data["error-type"] ?? "Exchange rate error");
  return { base: BASE, rates: data.conversion_rates };
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
