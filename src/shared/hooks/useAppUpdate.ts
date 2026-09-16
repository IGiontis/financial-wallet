import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { scheduleUpdateChecks } from "../../lib/updateChecks";
import { reloadOnNewWorker } from "../../lib/applyUpdate";

/**
 * Whether a newer version of the app is sitting there waiting, and how to take
 * it.
 *
 * The worker that has been built is deliberately patient: it installs, caches
 * the new build alongside the old one and then stops, because taking over a
 * page in the middle of its life is what used to break it. Nothing moves until
 * `apply` posts the message that releases it, and the page reloads onto the new
 * version as a whole.
 *
 * Registration itself is the only place the service worker is set up — the
 * plugin's injected script is off, so if this hook is not mounted the app has
 * no worker at all.
 */
export function useAppUpdate(): { needRefresh: boolean; apply: () => void } {
  const stopChecks = useRef<(() => void) | undefined>(undefined);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      setRegistration(r);
    },
  });

  useEffect(() => {
    if (!registration) return;
    // Left in a phone's background for a week, a page is never loaded again and
    // so never asks. This is what makes a new version turn up without the app
    // being force-quit first.
    stopChecks.current = scheduleUpdateChecks(() => {
      void registration.update().catch(() => {
        // Offline, or the server is having a moment. The next ask will do.
      });
    });
    return () => stopChecks.current?.();
  }, [registration]);

  return {
    needRefresh,
    apply: () => {
      // Arranged before the worker is released, so the handover cannot happen
      // between the two lines.
      reloadOnNewWorker({
        container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
        reload: () => window.location.reload(),
        setTimer: (fn, ms) => void setTimeout(fn, ms),
      });
      void updateServiceWorker(true);
    },
  };
}
