import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./config";

// ─── Google provider ──────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

// ─── Register with email & password ──────────────────────────────────────────

export const registerWithEmail = async (email: string, password: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Login with email & password ─────────────────────────────────────────────

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Login with Google ────────────────────────────────────────────────────────

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    throw err;
  }
};

// ─── Auth state listener ──────────────────────────────────────────────────────
// Use this to watch for login/logout changes anywhere in your app

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
