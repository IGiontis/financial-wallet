import { sendPasswordResetEmail, type Auth } from "firebase/auth";

// ─── A new password, by email ─────────────────────────────────────────────────
//
// Firebase sends the link itself: no collection, no reads. What comes back must
// never tell anyone whether an account exists for the address — so "no such
// user" reads exactly like "sent", and the screen says «if there is an account».

/** Seconds the send button rests after a send. */
export const RESET_COOLDOWN_SECONDS = 60;

/**
 * When the button may send again, kept for the page's life: going back to the
 * sign-in form, or closing the demo's dialog and opening it again, does not
 * start the wait over.
 */
export const resetCooldown = { until: 0 };

export function cooldownLeft(now = Date.now()): number {
  return Math.max(0, Math.ceil((resetCooldown.until - now) / 1000));
}

export function startCooldown(now = Date.now()) {
  resetCooldown.until = now + RESET_COOLDOWN_SECONDS * 1000;
}

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code ?? "";

/**
 * Sends the reset link to `email` through the given Auth. The link's «Συνέχεια»
 * comes back to this site's sign-in page — when the site is one of the
 * project's authorized domains; from any other (a preview deploy, a local
 * address) Firebase refuses the continue URL, and the link is sent without one.
 */
export async function sendResetLink(auth: Auth, email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login` });
  } catch (err) {
    const code = codeOf(err);
    if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") throw err;
    await sendPasswordResetEmail(auth, email);
  }
}

/** What the reset step shows for a send's outcome: an i18n key, and where it goes. */
export type ResetOutcome = { kind: "sent" } | { kind: "field"; key: string } | { kind: "alert"; key: string };

export function resetOutcome(err: unknown): ResetOutcome {
  if (err == null) return { kind: "sent" };
  switch (codeOf(err)) {
    // The same words as a send that went out: no telling who has an account.
    case "auth/user-not-found":
      return { kind: "sent" };
    case "auth/invalid-email":
    case "auth/missing-email":
      return { kind: "field", key: "validation.emailInvalid" };
    case "auth/too-many-requests":
      return { kind: "alert", key: "errors.tooManyRequests" };
    case "auth/network-request-failed":
      return { kind: "alert", key: "auth.reset.offline" };
    default:
      return { kind: "alert", key: "errors.generic" };
  }
}
