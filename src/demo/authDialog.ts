import { useSyncExternalStore } from "react";

// ─── Which sign-in dialog is open over the demo ──────────────────────────────
//
// «Σύνδεση», «Δημιουργία λογαριασμού», the note in Settings and the tour's last
// step all open the same dialog, from different corners of the app (one of
// them not even React: the tour's popover). So the state lives here, outside
// any component, and the dialog's one host reads it.

export type AuthDialogMode = "login" | "register";

let mode: AuthDialogMode | null = null;
const listeners = new Set<() => void>();

const set = (next: AuthDialogMode | null) => {
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener());
};

/** Opens the dialog on sign-in or sign-up; switches it, if it is already open. */
export const openAuthDialog = (next: AuthDialogMode) => set(next);

export const closeAuthDialog = () => set(null);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The open dialog's mode, or null. */
export const useAuthDialogMode = (): AuthDialogMode | null => useSyncExternalStore(subscribe, () => mode, () => null);
