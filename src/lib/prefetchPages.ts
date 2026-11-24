import { APP_PAGES, pageChunks, type PageChunk } from "./pageChunks";

// Fetches the code of every page ahead of time, once the browser has nothing
// better to do, so the first tap on a page does not wait for its download.
//
// Only code: a chunk is a static file from the app's own host (and, once
// installed, from the service worker's cache). Loading one runs the page's
// module, never the page — no component renders, no query starts, so it costs
// no Firestore read. The functions are the router's own (`pageChunks`), so the
// router later finds each chunk already on the device.

type Loader = () => Promise<unknown>;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether fetching ahead is welcome on this connection: not when the reader has
 * asked to save data, and not on 2G, where it would compete with what they
 * actually opened.
 */
export function prefetchAllowed(nav: { connection?: NetworkInformationLike } | undefined = globalThis.navigator as never): boolean {
  const connection = nav?.connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/(^|-)2g$/.test(connection.effectiveType ?? "");
}

interface IdleWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
}

/** When the browser is idle — or, where it cannot say (Safari), after a short pause. */
function whenIdle(run: () => void, win: IdleWindow & typeof globalThis): () => void {
  if (typeof win.requestIdleCallback === "function") {
    // The timeout: a page busy for ever (an endless animation) still gets its turn.
    const id = win.requestIdleCallback(run, { timeout: 3000 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = win.setTimeout(run, 300);
  return () => win.clearTimeout(id);
}

export interface PrefetchOptions {
  /** The pages, in order. Defaults to every page of the signed-in app. */
  pages?: readonly PageChunk[];
  /** The loaders. Defaults to the router's own; tests pass spies. */
  chunks?: Record<PageChunk, Loader>;
  /** The navigator to read the connection from. */
  nav?: { connection?: NetworkInformationLike };
  /** Where the idle callbacks come from. */
  win?: IdleWindow & typeof globalThis;
}

/**
 * Fetches the pages one at a time, each in its own idle moment after the last
 * one has arrived — a small stagger, so the prefetch never crowds out what the
 * reader is doing. Returns a stop function. A chunk that fails is skipped: the
 * router fetches it again when the page is opened, and reports a failure then.
 */
export function prefetchPages(options: PrefetchOptions = {}): () => void {
  const { pages = APP_PAGES, chunks = pageChunks, nav, win = globalThis as IdleWindow & typeof globalThis } = options;
  if (!prefetchAllowed(nav ?? (win.navigator as never))) return () => {};

  let stopped = false;
  let cancel = () => {};
  const next = (index: number) => {
    if (stopped || index >= pages.length) return;
    cancel = whenIdle(() => {
      if (stopped) return;
      chunks[pages[index]]()
        .catch(() => undefined)
        .then(() => next(index + 1));
    }, win);
  };
  next(0);
  return () => {
    stopped = true;
    cancel();
  };
}

// ─── Once per app open ─────────────────────────────────────────────────────

let started = false;

/**
 * Starts the idle prefetch for the signed-in app (or the demo), once per app
 * open: signing out and back in finds the chunks already loaded.
 */
export function startPagePrefetch(): void {
  if (started) return;
  started = true;
  prefetchPages();
}

/** The page chunk an address in the app opens, or null outside the app's pages. */
export function chunkForPath(pathname: string): PageChunk | null {
  const [first = "", second = ""] = pathname.replace(/^\/+/, "").split("/");
  if (first === "") return "overview";
  if (first === "transactions") return second === "new" ? "newTransaction" : second === "ledger" ? "ledger" : "transactions";
  // «Ημερολόγιο συναλλαγών» sits under «Ημερολόγιο» but is the Transactions
  // page in its calendar view, so it is that page's chunk.
  if (first === "calendar") return second === "transactions" ? "transactions" : "calendar";
  // The other pages are named after their address (/bills, /names, /goals …).
  return (APP_PAGES as readonly string[]).includes(first) ? (first as PageChunk) : null;
}

/**
 * Fetches one page's chunk the moment a finger or pointer reaches its link —
 * a head start of a few hundred milliseconds on a page the idle prefetch has
 * not reached yet. Only once the idle prefetch has been started (so never in
 * tests of the menu, and never signed out), and never on a connection that
 * asked not to.
 */
export function prefetchPath(pathname: string): void {
  if (!started || !prefetchAllowed()) return;
  const chunk = chunkForPath(pathname);
  if (chunk) pageChunks[chunk]().catch(() => undefined);
}
