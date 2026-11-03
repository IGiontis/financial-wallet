import { Modal } from "reactstrap";

/**
 * How long a dialog takes to fade in or out: `--motion-modal` in
 * styles/shape.css. The two have to agree — this is how long Reactstrap keeps
 * a closing dialog in the page, and so how much of the fade-out is seen.
 */
export const MODAL_MS = 220;

/** A frame's grace on the way out, so the last step of the fade is drawn before the dialog goes. */
const EXIT_MS = MODAL_MS + 20;

/**
 * Makes the browser settle the styles of what has just been put in the page.
 * A transition only runs from a style the browser has worked out: without
 * this, a dialog given `.show` in the same tick it was mounted would appear at
 * once, with no fade at all.
 */
const settle = () => {
  if (typeof document !== "undefined") void document.body.offsetHeight;
};

/**
 * Every Reactstrap dialog in the app, the same way in and out (styles/theme.css,
 * «Every dialog and sheet…»).
 *
 * Reactstrap adds `.show` — the class the fade runs on — only once its timer
 * for the opening has run out: 300ms of a dialog in the page but invisible,
 * then the fade. The opening timer goes to nothing, so the fade starts as the
 * dialog arrives (`settle` first, so there is a starting point to fade from),
 * and the closing one to the fade's own length, so the dialog stays until it
 * has faded. The backdrop follows the same two timings.
 *
 * Set on Reactstrap's defaults rather than on each dialog, because there are
 * dozens of them and every one should move alike; a dialog that passes its own
 * `modalTransition` still can. Called once, from App.tsx, before anything
 * renders.
 */
export function installModalMotion() {
  const defaults = (Modal as unknown as { defaultProps: Record<string, unknown> }).defaultProps;
  // Getters, read on every render, so a change of the device's motion setting
  // applies to the next dialog without a reload.
  defaults.modalTransition = {
    get timeout() {
      return timeouts();
    },
    onEnter: settle,
  };
  defaults.backdropTransition = {
    mountOnEnter: true,
    get timeout() {
      return timeouts();
    },
    onEnter: settle,
  };
}

/**
 * Under reduced motion the CSS fade is off, so a closing dialog would only sit
 * there, fully drawn, for the length of a fade nobody sees: it goes at once.
 */
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const timeouts = () => ({ enter: 0, exit: reducedMotion() ? 0 : EXIT_MS });
