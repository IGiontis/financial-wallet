import { firebaseApp } from "../firebase/config";

// Google Analytics for Firebase: how many people open the app, from where, on
// what — the Firebase Console's Analytics page.
//
// Only with consent. Its cookies are not needed for the app to work, so the
// EU's rules want a yes before they are set: until someone presses «Αποδοχή»
// the analytics library is not even downloaded. "No" is kept and never asked
// again; the footer's «Cookies» opens the question once more.
//
// Only in the live build, against the real project: development and the
// emulators would fill the numbers with the owner's own reloads.
//
// Nothing personal is sent — no e-mail, no account id, no amounts. Page views
// carry the path, and the app's paths hold no one's data.

const KEY = "analytics-consent";
const CHANGED = "analytics-consent-change";

export type Consent = "granted" | "denied";

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined;

/** Whether there is anything to ask about: the live build, with a measurement id set. */
export const analyticsConfigured = import.meta.env.PROD && !!measurementId;

export function readConsent(): Consent | undefined {
  try {
    const value = localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function setConsent(value: Consent) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private mode: the choice holds for this visit only.
  }
  window.dispatchEvent(new Event(CHANGED));
  void applyConsent(value);
}

/** The footer's «Cookies»: forget the answer, so the banner asks again. */
export function reopenConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function onConsentChange(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

let started: Promise<void> | undefined;

/**
 * Starts analytics on a yes; on a no after a yes, stops it collecting. The
 * library is imported here and only here, so a "no" costs no download.
 */
export async function applyConsent(value: Consent | undefined = readConsent()) {
  if (!analyticsConfigured) return;
  if (value === "granted") {
    started ??= import("firebase/analytics").then(async ({ getAnalytics, isSupported, setAnalyticsCollectionEnabled }) => {
      if (!(await isSupported())) return;
      setAnalyticsCollectionEnabled(getAnalytics(firebaseApp), true);
    });
    await started;
  } else if (value === "denied" && started) {
    const { getAnalytics, setAnalyticsCollectionEnabled } = await import("firebase/analytics");
    setAnalyticsCollectionEnabled(getAnalytics(firebaseApp), false);
  }
}
