import { useWorkspace, useWorkspaceSetting } from "./useWorkspaceSetting";
import { BUSINESS_ON_KEY } from "../../features/business/businessKeys";

// ─── Who may open what ────────────────────────────────────────────────────────
//
// The ONE place the app asks whether a page that not everyone uses is open to
// this account. Today the answer is the user's own choice, a setting on the
// user document (Settings → «Σελίδα Δουλειά»), read with the rest of the
// workspace — no read of its own. Later tiers plug in here, and nowhere else:
// the menu, the route and the page all ask this hook.

/** The pages that can be switched on and off. */
export type Feature = "business";

/** The user-document key that holds each one's switch. */
export const FEATURE_KEYS: Record<Feature, string> = {
  business: BUSINESS_ON_KEY,
};

/** Whether this account has `feature` switched on. Off until it is. */
export function useHasAccess(feature: Feature): boolean {
  const [on] = useWorkspaceSetting<boolean>(FEATURE_KEYS[feature], false);
  return on === true;
}

/**
 * The same, with "not known yet": the user document has not arrived and this
 * device holds no answer. A route waits on it rather than turning a page that
 * is on away during the first moment of a cold start.
 */
export function useAccessState(feature: Feature): "on" | "off" | "unknown" {
  const on = useHasAccess(feature);
  const { isSuccess, isError } = useWorkspace();
  if (on) return "on";
  return isSuccess || isError ? "off" : "unknown";
}
