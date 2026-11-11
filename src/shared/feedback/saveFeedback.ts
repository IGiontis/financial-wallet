import { useEffect, useRef } from "react";
import { useRowFlash } from "../hooks/useRowFlash";

/**
 * «Did that save?» — the one answer every form gives after a successful save
 * (item 81). Three parts, all from here, so every form feels the same:
 *
 *   1. the dialog gives a short success pulse — a ring of the brand's green
 *      around the dialog card, a tiny swell (`.save-pulse`, styles/theme.css);
 *   2. the saved row lights up on the page behind it (`useSavedFlash` below,
 *      on top of `useRowFlash` / `.row-flash`);
 *   3. light confetti, ONLY for a milestone — a goal reached, a debt paid off.
 *
 * Under reduced motion all three are colour and fades only: the pulse keeps its
 * ring and loses the swell, the row flash is a tint already, and the confetti
 * becomes a soft wash of colour over the screen that fades out.
 *
 * In a form, after the save resolved:
 *
 *   celebrateSave({ collection: "transactions" });            // a new record
 *   celebrateSave({ collection: "debts", id, milestone: true }); // paid off
 *
 * On the list page that shows those records:
 *
 *   const flashClass = useSavedFlash("transactions", rows.map((r) => r.id));
 *   <tr className={flashClass(row.id)}>
 *
 * Costs nothing in Firestore: it is all in the page.
 */

export interface SaveFeedback {
  /** Which list shows the record (e.g. "transactions") — its row will flash. */
  collection?: string;
  /** The saved record's id. Left out for a new record whose id the form never
   *  sees (optimistic saves): the list then flashes the row that appears. */
  id?: string;
  /** A goal completed, a debt paid off: confetti on top. */
  milestone?: boolean;
  /** The dialog card to pulse; by default the open dialog's. */
  dialog?: Element | null;
}

interface Announcement {
  collection: string;
  id?: string;
}

const listeners = new Set<(a: Announcement) => void>();

/** Tells the list showing `collection` that a record was saved. */
export function announceSaved(collection: string, id?: string) {
  for (const listen of listeners) listen({ collection, id });
}

/** How long the dialog's pulse runs (theme.css, `.save-pulse`: 700ms). */
export const SAVE_PULSE_MS = 700;
/** How long the confetti stays on screen. */
export const CONFETTI_MS = 1600;

const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The pulse on the dialog card: the class on, then off again when it has played. */
export function pulseDialog(dialog?: Element | null) {
  if (typeof document === "undefined") return;
  const el = dialog ?? document.querySelector(".modal.show .modal-content");
  if (!el) return;
  el.classList.remove("save-pulse");
  // A reflow between, so a second save in a row plays it again.
  void (el as HTMLElement).offsetWidth;
  el.classList.add("save-pulse");
  setTimeout(() => el.classList.remove("save-pulse"), SAVE_PULSE_MS + 50);
}

/** The pieces' colours: roles, so they follow the theme and the colourway. */
const CONFETTI_COLOURS = ["var(--brand)", "var(--income)", "var(--goal)", "var(--invest)", "var(--pending)"];

/**
 * Light confetti for a milestone: forty small pieces falling from the top in
 * the app's colours, gone in under two seconds, never in the way (no pointer
 * events, hidden from screen readers). Under reduced motion: a soft wash of the
 * brand that fades — colour, not movement.
 */
export function confetti() {
  if (typeof document === "undefined") return;
  const layer = document.createElement("div");
  layer.className = prefersReducedMotion() ? "mfw-confetti mfw-confetti--calm" : "mfw-confetti";
  layer.setAttribute("aria-hidden", "true");
  if (!prefersReducedMotion()) {
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement("span");
      piece.className = "mfw-confetti__piece";
      piece.style.setProperty("--x", `${Math.round(Math.random() * 100)}vw`);
      piece.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 30)}vw`);
      piece.style.setProperty("--spin", `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.setProperty("--delay", `${Math.round(Math.random() * 250)}ms`);
      piece.style.setProperty("--c", CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]);
      layer.appendChild(piece);
    }
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), CONFETTI_MS + 300);
}

/** The whole answer to a successful save — call it once, after the save resolved. */
export function celebrateSave({ collection, id, milestone = false, dialog }: SaveFeedback = {}) {
  pulseDialog(dialog);
  if (collection) announceSaved(collection, id);
  if (milestone) confetti();
}

/** An id that showed up before the form announced its save still counts this long. */
const ARRIVED_MS = 1500;
/** How long a save without an id waits for its row to appear. */
const WAIT_MS = 5000;

/**
 * Did the list GROW — the same rows plus a new one or two — rather than change
 * wholesale? The new id when it grew; `null` when nothing new came in;
 * `undefined` when it is a different list (a filter, the next page): more than
 * three new ids, or under half of the old rows still there.
 */
export function grewBy(before: ReadonlySet<string>, ids: readonly string[]): string | null | undefined {
  const fresh = ids.filter((id) => !before.has(id));
  if (fresh.length === 0) return null;
  const kept = ids.length - fresh.length;
  if (fresh.length > 3 || (before.size > 0 && kept < before.size * 0.5)) return undefined;
  return fresh[0];
}

/**
 * The list side: lights the row that was just saved in `collection`. Pass the
 * ids on screen; when the save named no id, the first id that appears after it
 * (the new record arriving in the list) is the one lit. Returns the class for
 * a row, as `useRowFlash`'s `flashClass` does.
 */
export function useSavedFlash(collection: string, ids: readonly string[]) {
  const { flash, flashClass } = useRowFlash<string>();
  const known = useRef<Set<string>>(new Set(ids));
  // The id that arrived as a GROWTH of the list (see `grewBy` below), with when —
  // an optimistic save can draw its row a moment BEFORE the form says it saved.
  // One entry at most, and only for ARRIVED_MS.
  const arrived = useRef<{ id: string; at: number } | null>(null);
  const waiting = useRef<{ since: number } | null>(null);

  useEffect(() => {
    const listen = (a: Announcement) => {
      if (a.collection !== collection) return;
      if (a.id) {
        waiting.current = null;
        flash(a.id);
        return;
      }
      const recent = arrived.current && Date.now() - arrived.current.at < ARRIVED_MS ? arrived.current : null;
      arrived.current = null;
      if (recent) {
        waiting.current = null;
        flash(recent.id);
      } else {
        waiting.current = { since: Date.now() };
      }
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, [collection, flash]);

  useEffect(() => {
    const fresh = grewBy(known.current, ids);
    known.current = new Set(ids);
    if (arrived.current && Date.now() - arrived.current.at >= ARRIVED_MS) arrived.current = null;
    if (waiting.current && Date.now() - waiting.current.since >= WAIT_MS) waiting.current = null;
    if (fresh === undefined) {
      // A filter, a sort or another page: a different list, not a new row in
      // this one. Whatever we were waiting for landed out of sight — let it go,
      // or the next page would light a row nobody saved.
      waiting.current = null;
      arrived.current = null;
      return;
    }
    if (fresh === null) return;
    if (waiting.current) {
      waiting.current = null;
      flash(fresh);
    } else {
      arrived.current = { id: fresh, at: Date.now() };
    }
  }, [ids, flash]);

  return flashClass;
}
