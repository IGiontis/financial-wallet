import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { WelcomeTour } from "./WelcomeTour";
import { TOUR_PARAM, TOUR_SEEN_KEY } from "./tourState";

/**
 * The welcome tour in the signed-in app: once, the first time — and again
 * whenever the settings ask (`?tour=1`). Finishing or skipping it marks it seen.
 *
 * Waits for the account's settings, so a device that has not seen it does not
 * show it to someone who has, on another. One write, when it is put away.
 */
export function TourGate() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { isSuccess: settingsLoaded } = useWorkspace();
  const [seen, setSeen] = useWorkspaceSetting(TOUR_SEEN_KEY, false);
  const asked = new URLSearchParams(search).get(TOUR_PARAM) === "1";

  if (!asked && (!settingsLoaded || seen)) return null;

  const done = () => {
    if (!seen) setSeen(true);
    if (asked) navigate(pathname, { replace: true });
  };
  return <WelcomeTour onDone={done} />;
}

export default TourGate;
