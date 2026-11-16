import { useMoneyAccounts } from "../../features/accounts/useMoneyAccounts";
import type { OpeningBalance } from "../utils/balance";

/**
 * Where the balance is counted from.
 *
 * The latest reading of the banks when there is one; otherwise the figure typed
 * in Settings; otherwise nothing, and the balance is the net of every record.
 * `anchors` is the whole history of them, oldest first, for the charts that
 * draw a balance month by month.
 */
export function useOpeningBalance(): {
  opening: OpeningBalance | undefined;
  anchors: OpeningBalance[];
  /** Where `opening` came from. */
  source: "readings" | undefined;
  isLoading: boolean;
  /** Nothing to count from yet — see `useMoneyAccounts`. */
  missing: boolean;
} {
  const { anchors, latest, isLoading, missing } = useMoneyAccounts();
  const opening = anchors.at(-1);
  const source = latest ? "readings" : undefined;
  return { opening, anchors, source, isLoading, missing };
}
