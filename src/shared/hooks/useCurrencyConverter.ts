import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getUser } from "../../firebase/firestore";
import { fetchExchangeRates, convertAmount } from "../../firebase/exchangeRate";
import type { Currency } from "../../shared/types/IndexTypes";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const exchangeRateKeys = {
  rates: () => ["exchangeRates"] as const,
  user: (uid: string) => ["userCurrency", uid] as const,
};

// ─── useCurrencyConverter ─────────────────────────────────────────────────────

export function useCurrencyConverter() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? "";

  // Exchange rates — cached 1 hour
  const { data: rateData, isLoading: ratesLoading } = useQuery({
    queryKey: exchangeRateKeys.rates(),
    queryFn: fetchExchangeRates,
    staleTime: 1000 * 60 * 60,
    retry: 2,
  });

  const convertToBase = (amount: number): number => {
    if (!rateData) return amount;
    return convertAmount(amount, displayCurrency, baseCurrency, rates);
  };
  // User preferences
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: exchangeRateKeys.user(uid),
    queryFn: () => getUser(uid),
    enabled: !!uid,
    staleTime: 0, // always fetch fresh when component mounts
  });

  const baseCurrency = (userData?.baseCurrency ?? "EUR") as Currency;
  const displayCurrency = (userData?.currency ?? "EUR") as Currency;
  const rates = rateData?.rates ?? {};
  const isLoading = ratesLoading || userLoading;

  // Convert amount from baseCurrency (or a given currency) to displayCurrency
  const convert = (amount: number, fromCurrency?: Currency): number => {
    const from = fromCurrency ?? baseCurrency;
    if (!rateData) return amount;
    return convertAmount(amount, from, displayCurrency, rates);
  };

  // Format amount as currency string in displayCurrency
  const format = (amount: number, fromCurrency?: Currency): string => {
    const converted = convert(amount, fromCurrency);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted);
  };

  return {
    convert,
    format,
    convertToBase,
    baseCurrency,
    displayCurrency,
    isLoading,
  };
}
