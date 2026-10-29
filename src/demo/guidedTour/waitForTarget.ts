// ─── Waiting for a step's element ────────────────────────────────────────────
//
// The tour moves to a page and then points at something on it, but the page
// is a lazy chunk and its figures come a moment after it: the element is not
// there yet when the route changes. So each step waits for it — watching the
// document rather than guessing a delay — and gives up after a few seconds, so
// that a page which no longer has it costs the tour one step, not the tour.

/** Long enough for a lazy page on a slow phone, short enough not to feel stuck. */
export const TARGET_TIMEOUT_MS = 3000;

/**
 * On the screen, not merely in the document: the Transactions page draws its
 * desktop and phone layouts both and hides one, and a mark inside the hidden
 * one has no box to point at.
 */
export function isShown(element: Element): boolean {
  // Anything under `display: none` has no boxes at all.
  return element.isConnected && element.getClientRects().length > 0;
}

/** The first element matching `selector` that is on the screen. */
export function findShown(selector: string, root: ParentNode = document): Element | null {
  for (const element of root.querySelectorAll(selector)) if (isShown(element)) return element;
  return null;
}

/**
 * Resolves with the first shown element matching `selector`, as soon as there
 * is one, or `null` after `timeoutMs` — or at once, when `cancelled` says the
 * tour has moved on or closed in the meantime.
 */
export function waitForTarget(selector: string, timeoutMs: number = TARGET_TIMEOUT_MS, cancelled: () => boolean = () => false): Promise<Element | null> {
  const found = findShown(selector);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let done = false;
    const finish = (element: Element | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve(element);
    };
    const check = () => {
      if (cancelled()) return finish(null);
      const element = findShown(selector);
      if (element) finish(element);
    };
    // Every change to the page, for an element that is added; and a slow poll
    // besides, for one that was there all along and only becomes visible — a
    // class or a media query changing, which no mutation of its own reports.
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    const poll = window.setInterval(check, 150);
    const timer = window.setTimeout(() => finish(findShown(selector)), timeoutMs);
  });
}
