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
  source: "readings" | "settings" | undefined;
  isLoading: boolean;
} {
  const { anchors, latest, legacy, isLoading } = useMoneyAccounts();
  const opening = anchors.at(-1);
  const source = latest ? "readings" : legacy ? "settings" : undefined;
  return { opening, anchors, source, isLoading };
}
