/**
 * Loading the page again once the new worker is the one in charge.
 *
 * This looks like something the plugin already does, and it nearly is: it
 * reloads on `controlling`, but only when the page was already under a worker
 * at the moment it registered one. The page that *installed* the worker was not
 * — `isUpdate` is false for the whole of that visit — and that is the page a
 * first-time reader is sitting in front of. For them the button did the worst
 * possible thing: the new worker took over and swapped the cache underneath,
 * and the screen carried on running the old code.
 *
 * So the reload is ours, tied to the only event that says the swap is done.
 */
export interface ApplyUpdateDeps {
  /** `navigator.serviceWorker`, or nothing on a browser without one. */
  container?: Pick<ServiceWorkerContainer, "addEventListener">;
  reload: () => void;
  setTimer: (fn: () => void, ms: number) => void;
  /** How long to wait for the handover before reloading anyway. */
  fallbackMs?: number;
}

export function reloadOnNewWorker({ container, reload, setTimer, fallbackMs = 3000 }: ApplyUpdateDeps): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    reload();
  };

  container?.addEventListener("controllerchange", go, { once: true });

  // And if the handover never comes — the message went nowhere, the worker was
  // already gone — reload regardless. The new build is on the server either
  // way, and a reader who asked for the new version should not be left holding
  // a button that did nothing.
  setTimer(go, fallbackMs);
}
