import { cssTransition, toast, type ToastContainerProps, type ToastOptions } from "react-toastify";

/**
 * How long a toast stays when nothing else is said (news, an info line):
 * long enough for two short lines.
 */
export const TOAST_MS = 4000;

/**
 * Per kind. «Saved» is a glance — 2.8 s, then it is out of the way. Something
 * that went wrong or needs a look carries what to do next, so it stays 6 s —
 * and any toast goes the moment it is tapped or swiped (item 78).
 */
export const TOAST_MS_BY_TYPE = { success: 2800, error: 6000, warning: 6000 } as const;

/**
 * Where a toast counts as on a phone: a narrow screen, or a phone on its side
 * (wide but short). The same query as the toast rules in styles/theme.css.
 */
export const TOAST_PHONE_QUERY = "(max-width: 575.98px), (max-height: 500px)";

const onPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(TOAST_PHONE_QUERY).matches;

/** The dialogs' motion for toasts: a short travel and a fade (styles/theme.css, `toast-enter`). */
export const ToastRise = cssTransition({ enter: "toast-enter", exit: "toast-exit" });

/**
 * The container's settings, in one place (App.tsx mounts it).
 *
 * On a phone a toast drops in at the TOP, under the status bar — never over
 * the «+» or the footer at the bottom, where the old one sat and got lost —
 * newest first, swiped up (or down) to go. On a wider screen a card at the
 * TOP-RIGHT, just under the top bar and clear of it (the owner, 2026-11-11:
 * the bottom corner went unseen), newest first, swiped sideways. Everywhere: a tap
 * closes it; it waits while a finger or the pointer is on it (dragging pauses
 * it too), while it has focus and while the window is in the background; at
 * most three at once. Decided once, when the app starts: a phone turned on its
 * side counts as a phone (the query above), so a turn does not move it.
 */
export const TOAST_CONTAINER: ToastContainerProps = (() => {
  const phone = onPhone();
  return {
    position: phone ? "top-center" : "top-right",
    autoClose: TOAST_MS,
    hideProgressBar: true,
    newestOnTop: true,
    closeOnClick: true,
    pauseOnHover: true,
    pauseOnFocusLoss: true,
    draggable: true,
    draggableDirection: phone ? "y" : "x",
    draggablePercent: 25,
    limit: 3,
    theme: "light",
    transition: ToastRise,
  } satisfies ToastContainerProps;
})();

let installed = false;

/**
 * The times per kind, without touching the twenty-odd places that call
 * `toast.success(…)` / `toast.error(…)` / `toast.warning(…)`: the three are
 * wrapped once so their default `autoClose` is their own. A call that passes
 * its own `autoClose` keeps it. Called once, from App.tsx.
 */
export function installToastDefaults() {
  if (installed) return;
  installed = true;
  for (const type of ["success", "error", "warning"] as const) {
    const show = toast[type];
    toast[type] = ((content: Parameters<typeof show>[0], options?: ToastOptions) => show(content, { autoClose: TOAST_MS_BY_TYPE[type], ...options })) as typeof show;
  }
}
