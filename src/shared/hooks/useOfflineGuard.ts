import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "./useOnlineStatus";
import { isLockedOffline, type OfflineAction } from "../utils/offlinePolicy";

// One sentence per rule, so a disabled button is never just grey.
const REASON: Record<OfflineAction, string> = {
  delete: "common.offlineDelete",
  settings: "common.offlineSettings",
  entry: "",
};

/**
 * Whether an action is held back for want of a connection, and what to say.
 *
 * The rule itself lives in `offlinePolicy` and is enforced in the data layer;
 * this is the part the reader sees, so that a control they cannot use tells
 * them why rather than simply refusing to respond.
 */
export function useOfflineGuard(action: OfflineAction): { locked: boolean; reason: string | undefined } {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  const locked = isLockedOffline(action, online);

  return { locked, reason: locked ? t(REASON[action]) : undefined };
}
