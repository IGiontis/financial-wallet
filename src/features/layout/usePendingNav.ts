import { useContext, useSyncExternalStore } from "react";
import { matchPath, useLocation, UNSAFE_DataRouterContext, type Location } from "react-router-dom";

/**
 * Where a tap is taking the reader, while the page there is still on its way.
 *
 * React Router renders a navigation inside a transition: until the new page
 * can be drawn — its code downloaded, its first render done — React keeps the
 * old page on screen, and `useLocation()` still names the old address. The
 * router itself has moved on at once, though, so its own state is read here
 * outside the transition (`useSyncExternalStore` updates are never deferred)
 * and compared with what is on screen. Different, and a page is pending.
 *
 * Returns the address being opened, or null when the screen has caught up.
 */
export function usePendingLocation(): Location | null {
  const shown = useLocation();
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const target = useSyncExternalStore(
    router ? router.subscribe : noSubscribe,
    () => router?.state.location ?? shown,
  );
  return target.key !== shown.key ? target : null;
}

function noSubscribe() {
  return () => {};
}

/**
 * The path the menu should mark as the current one: the one being opened as
 * soon as it is tapped, so the tap answers before the page arrives.
 */
export function useShownPathname(): string {
  const { pathname } = useLocation();
  return usePendingLocation()?.pathname ?? pathname;
}

/** Whether `pathname` is on the page a menu link `to` points at (NavLink's own rule). */
export function linkMatches(to: string, pathname: string, end: boolean): boolean {
  return matchPath({ path: to, end }, pathname) !== null;
}
