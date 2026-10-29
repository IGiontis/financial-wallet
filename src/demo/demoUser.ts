import type { User } from "firebase/auth";

// The demo's signed-in user: what `AuthContext` hands every screen in place of
// Firebase's. The screens read its id (every query key carries it, which keeps
// the demo's cache apart from any real account's), its email and its sign-in
// provider; the name they show comes from the user document in the fixtures.
//
// Built by hand rather than by Firebase, so it has none of `User`'s methods —
// nothing in the app calls them, and nothing may: there is no session behind it.

export const DEMO_UID = "demo";
// A reserved example domain: nobody can own it, so nothing can ever be sent to it.
export const DEMO_EMAIL = "demo@example.com";

export const demoUser = Object.freeze({
  uid: DEMO_UID,
  email: DEMO_EMAIL,
  emailVerified: true,
  displayName: "Demo",
  isAnonymous: false,
  photoURL: null,
  phoneNumber: null,
  providerId: "firebase",
  tenantId: null,
  metadata: {},
  providerData: [{ providerId: "password", uid: DEMO_EMAIL, email: DEMO_EMAIL, displayName: null, phoneNumber: null, photoURL: null }],
}) as unknown as User;
