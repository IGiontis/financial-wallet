import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "./useAuth";
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
  const { i18n } = useTranslation();
  const uid = currentUser?.uid ?? "";

  // Exchange rates — cached 1 hour
  const { data: rateData, isLoading: ratesLoading } = useQuery({
    queryKey: exchangeRateKeys.rates(),
    queryFn: fetchExchangeRates,
    staleTime: 1000 * 60 * 60,
    retry: 2,
  });

  // Currency + locale change only from the Settings screen, which updates this
  // cache itself — so there's no reason to keep re-reading the user document.
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: exchangeRateKeys.user(uid),
    queryFn: () => getUser(uid),
    enabled: !!uid,
    staleTime: 1000 * 60 * 30,
  });

  const baseCurrency = (userData?.baseCurrency ?? "EUR") as Currency;
  const displayCurrency = (userData?.currency ?? "EUR") as Currency;
  const rates = useMemo(() => rateData?.rates ?? {}, [rateData]);
  const isLoading = ratesLoading || userLoading;

  // Convert amount from baseCurrency (or a given currency) to displayCurrency
  const convert = useCallback(
    (amount: number, fromCurrency?: Currency): number => {
      if (!rateData) return amount;
      return convertAmount(amount, fromCurrency ?? baseCurrency, displayCurrency, rates);
    },
    [rateData, baseCurrency, displayCurrency, rates],
  );

  const convertToBase = useCallback(
    (amount: number): number => {
      if (!rateData) return amount;
      return convertAmount(amount, displayCurrency, baseCurrency, rates);
    },
    [rateData, displayCurrency, baseCurrency, rates],
  );

  // Number formatting follows the user's language, not a fixed locale — Greek
  // writes 1.234,56 € where English writes €1,234.56. Building the formatter
  // once per locale/currency pair keeps it off the hot path in long lists.
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
        style: "currency",
        currency: displayCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.resolvedLanguage, displayCurrency],
  );

  const format = useCallback((amount: number, fromCurrency?: Currency): string => formatter.format(convert(amount, fromCurrency)), [formatter, convert]);

  return {
    convert,
    format,
    convertToBase,
    baseCurrency,
    displayCurrency,
    isLoading,
  };
}
