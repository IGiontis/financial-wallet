// ─── The name the app calls you by ───────────────────────────────────────────
//
// Shown top right (the account menu, the sidebar's card) and in the welcome
// while the app opens. One rule, here, so the three never disagree:
//
//   1. the name you set in Settings → Profile («Όνομα εμφάνισης»), if any;
//   2. signed in with Google, the name Google gives — automatically;
//   3. otherwise your own: the username, or the email's part before the @.
//
// Stored as `displayName` on the user document the app already reads — no
// collection of its own, no extra read. An empty one means "not set": clearing
// the box writes "" rather than deleting the field, which needs no special
// write and reads the same.

/** At most this many characters: it has to fit beside the avatar on a phone. */
export const DISPLAY_NAME_MAX = 24;

/** Trimmed, inner runs of spaces made one, and cut to the limit. */
export function cleanDisplayName(value: string | null | undefined): string {
  return Array.from((value ?? "").trim().replace(/\s+/g, " "))
    .slice(0, DISPLAY_NAME_MAX)
    .join("")
    .trim();
}

export interface NameSources {
  /** The user document's `displayName` — the one set in Settings. */
  custom?: string | null;
  isGoogle: boolean;
  /** Firebase Auth's `displayName`: Google's name for a Google account. */
  googleName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}

/** The name to show, by the rule above. Empty only when there is nothing at all to go by. */
export function resolveDisplayName({ custom, isGoogle, googleName, firstName, lastName, username, email }: NameSources): string {
  const own = cleanDisplayName(custom);
  if (own) return own;
  if (isGoogle) {
    const google = (googleName ?? "").trim();
    if (google) return google;
    const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    if (full) return full;
  }
  const user = (username ?? "").trim();
  if (user) return user;
  return (email ?? "").split("@")[0] ?? "";
}
