import { useSyncExternalStore } from "react";

/**
 * «Κινούμενα εφέ» — Settings, on this device (localStorage), on by default.
 *
 * Off, everything that loops for ever stops where it stands: the goal tanks'
 * flowing surface, the loading shimmer, the welcome bar. It is the switch for
 * people who need stillness, because «reduce motion» on the system no longer
 * stills the tanks' small, slow wave (the owner, 2026-11-11: his own Windows
 * asks for reduced motion, and the water has to move). One-off effects — a
 * dialog's fade, a saved row's flash, a deposit's pour — are not loops and
 * are left to reduced motion as before.
 *
 * How: `data-motion="off"` on <html>, which sets `--loop-play: paused`
 * (index.css); every endless animation reads it (reducedMotion.test.ts).
 * No Firestore read or write.
 */
export const MOTION_KEY = "motion-effects";

const listeners = new Set<() => void>();

/** Is it on? Anything but a stored "off" is on — a private window included. */
export function motionEffectsOn(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) !== "off";
  } catch {
    return true;
  }
}

function apply(on: boolean) {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-motion", on ? "on" : "off");
}

/** Called once, before anything renders (App.tsx), so a still device never sees a frame of movement. */
export function installMotionEffects() {
  apply(motionEffectsOn());
}

export function setMotionEffects(on: boolean) {
  try {
    localStorage.setItem(MOTION_KEY, on ? "on" : "off");
  } catch {
    // Storage refused (a private window): it still applies until the page is closed.
  }
  apply(on);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The switch, for the Settings control. */
export function useMotionEffects(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, motionEffectsOn, () => true);
  return [on, setMotionEffects];
}
