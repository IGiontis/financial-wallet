import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getUser } from "../../firebase/firestore";
import { exchangeRateKeys } from "./useCurrencyConverter";
import { firestoreToDate } from "../utils/dates";
import type { OpeningBalance } from "../utils/balance";

/**
 * The starting figure typed in Settings, or undefined when they never set one.
 *
 * Shares `useCurrencyConverter`'s cache key on purpose: it is the same user
 * document, already fetched on nearly every screen, and a second query key
 * would double the reads to show one figure.
 */
export function useSettingsOpening(): { opening: OpeningBalance | undefined; isLoading: boolean } {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? "";

  const { data, isLoading } = useQuery({
    queryKey: exchangeRateKeys.user(uid),
    queryFn: () => getUser(uid),
    enabled: !!uid,
    staleTime: 1000 * 60 * 30,
  });

  // An amount without a date would silently count every backfilled record
  // against it — the exact double-subtraction the pairing exists to prevent.
  // Built once per fetch: everything that reads the balance recomputes when
  // this object changes, and a fresh one per render would mean every render.
  const opening = useMemo(() => {
    const amount = data?.openingBalance;
    const date = data?.openingBalanceDate;
    return amount != null && date ? { amount, date: firestoreToDate(date) } : undefined;
  }, [data]);

  return { opening, isLoading };
}
