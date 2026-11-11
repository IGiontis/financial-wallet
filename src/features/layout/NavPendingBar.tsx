import { useTranslation } from "react-i18next";
import { usePendingLocation } from "./usePendingNav";

/**
 * A thin bar along the top of the screen while a tapped page is on its way.
 *
 * The old page stays put until the new one can be drawn (see
 * `usePendingLocation`); without this, a slow page looked like a tap that had
 * not been heard. It fades in only after a moment (MainLayout.css), so a page
 * that opens at once never blinks it.
 */
export function NavPendingBar() {
  const { t } = useTranslation();
  const pending = usePendingLocation();
  if (!pending) return null;
  return <div className="nav-pending-bar" role="progressbar" aria-label={t("nav.pageLoading")} aria-busy="true" />;
}
