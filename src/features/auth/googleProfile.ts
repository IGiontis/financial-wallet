import type { User as FirebaseUser } from "firebase/auth";
import { createUser, getUser } from "../../firebase/firestore";

/**
 * The profile document for someone who has just come in with Google — made
 * only if there is none yet.
 *
 * Google does not distinguish signing up from signing in: the same button on
 * either page lands on the same account. `createUser` writes the whole document
 * without merging, so running it for an account that already exists replaced
 * everything on it — banks and cash, every balance reading, the planner, saved
 * payees, the currency — with an empty new profile. The register page did just
 * that; the login page checked first. Both go through here now.
 *
 * Returns whether a new profile was created.
 */
export async function ensureGoogleProfile(firebaseUser: Pick<FirebaseUser, "uid" | "email" | "displayName">, locale: string): Promise<boolean> {
  const existing = await getUser(firebaseUser.uid);
  if (existing) return false;

  const [firstName = "", lastName = ""] = (firebaseUser.displayName ?? "").split(" ");
  await createUser(firebaseUser.uid, {
    email: firebaseUser.email ?? "",
    username: firebaseUser.uid.slice(0, 12),
    firstName,
    lastName,
    locale,
  });
  return true;
}
