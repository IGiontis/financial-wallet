import { cssTransition, toast, type ToastContainerProps, type ToastOptions } from "react-toastify";

/**
 * How long a toast stays when nothing else is said. Six seconds is enough to
 * read two lines in Greek and look back at the page; three, as it was, went
 * while people were still finding it.
 */
export const TOAST_MS = 6000;

/**
 * Something went wrong, or needs a look: these carry what to do next, so they
 * stay longer. Still timed rather than kept until dismissed — a failed save
 * retried twice would otherwise leave three red cards on a phone screen.
 */
export const TOAST_MS_BY_TYPE = { error: 10000, warning: 8000 } as const;

/** The dialogs' motion for toasts: a rise and a fade (styles/theme.css, `toast-enter`). */
export const ToastRise = cssTransition({ enter: "toast-enter", exit: "toast-exit" });

/**
 * The container's settings, in one place (App.tsx mounts it). Bottom right on
 * a wide screen; theme.css turns that into a full-width card above the «+» on
 * a phone. Paused while the pointer is on it, while it has focus and while the
 * window is in the background (the library's `pauseOnFocusLoss`); swiped or
 * dragged away; at most three at once, the oldest leaving first.
 */
export const TOAST_CONTAINER: ToastContainerProps = {
  position: "bottom-right",
  autoClose: TOAST_MS,
  hideProgressBar: false,
  newestOnTop: false,
  closeOnClick: false,
  pauseOnHover: true,
  pauseOnFocusLoss: true,
  draggable: true,
  draggablePercent: 40,
  limit: 3,
  theme: "light",
  transition: ToastRise,
};

let installed = false;

/**
 * The longer times for errors and warnings, without touching the twenty-odd
 * places that call `toast.error(…)` / `toast.warning(…)`: the two are wrapped
 * once so their default `autoClose` is the longer one. A call that passes its
 * own `autoClose` keeps it. Called once, from App.tsx.
 */
export function installToastDefaults() {
  if (installed) return;
  installed = true;
  for (const type of ["error", "warning"] as const) {
    const show = toast[type];
    toast[type] = ((content: Parameters<typeof show>[0], options?: ToastOptions) => show(content, { autoClose: TOAST_MS_BY_TYPE[type], ...options })) as typeof show;
  }
}
