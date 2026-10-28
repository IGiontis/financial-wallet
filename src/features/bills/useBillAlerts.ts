import { useMemo } from "react";
import { useBills } from "./useBills";
import { asReach, billAlerts, DEFAULT_REACH, reachDays, reachFor, type AlertReach, type ReachByBill } from "./billAlerts";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";

/** On or off, from «Ρυθμίσεις → Προτιμήσεις». On unless switched off. */
export const BILL_ALERTS_KEY = "bill-alerts";
/** How far ahead it looks (`AlertReach`), from the same place. */
export const BILL_ALERTS_REACH_KEY = "bill-alerts-reach";
/** One reach for every bill, or each bill its own — never both at once. */
export const BILL_ALERTS_MODE_KEY = "bill-alerts-scope";
export type BillAlertsMode = "all" | "bill";
/** A reach per bill (`ReachByBill`), read only in the "bill" mode. */
export const BILL_ALERTS_BY_BILL_KEY = "bill-alerts-by-bill";
/** The bills it leaves out, by id — picked there too. A new bill is in until left out. */
export const BILL_ALERTS_OFF_KEY = "bill-alerts-off";
/** The payments «Μην μου ξαναδείξεις» put away — `BillAlert.key`s. */
export const BILL_ALERTS_SEEN_KEY = "bill-alerts-seen";
/** Where the settings are: the address the popup's link opens. */
export const BILL_ALERTS_SETTINGS = "/settings/preferences#bill-alerts";

/**
 * The bills popup as its saved settings make it: the payments it names today
 * (`billAlerts`, with each bill's reach) and the ones put away — one reading
 * for the popup and for the settings that say what it has hidden.
 *
 * No reads of its own: the bills are the query the menu's badge holds, and
 * the settings sit on the user document already read at start-up.
 */
export function useBillAlerts(now: Date) {
  const { data: bills } = useBills();
  const { isSuccess: settingsLoaded } = useWorkspace();
  const [enabled] = useWorkspaceSetting(BILL_ALERTS_KEY, true);
  const [storedReach] = useWorkspaceSetting<AlertReach>(BILL_ALERTS_REACH_KEY, DEFAULT_REACH);
  const [off] = useWorkspaceSetting<string[]>(BILL_ALERTS_OFF_KEY, []);
  const [mode] = useWorkspaceSetting<BillAlertsMode>(BILL_ALERTS_MODE_KEY, "all");
  const [storedByBill] = useWorkspaceSetting<ReachByBill>(BILL_ALERTS_BY_BILL_KEY, {});
  const [seen, setSeen] = useWorkspaceSetting<string[]>(BILL_ALERTS_SEEN_KEY, []);
  const reach = asReach(storedReach);
  // Kept when the mode goes back to one for all, so switching back finds them; read only in their mode.
  const byBill = useMemo(() => (mode === "bill" ? storedByBill : {}), [mode, storedByBill]);

  const alerts = useMemo(
    () => billAlerts((bills ?? []).filter((bill) => !off.includes(bill.id)), now, (bill) => reachDays(reachFor(bill, reach, byBill), now)),
    [bills, off, now, reach, byBill],
  );

  return { loaded: settingsLoaded && !!bills, enabled, reach, byBill, alerts, seen, setSeen };
}
