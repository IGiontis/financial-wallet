import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getUser } from "../../firebase/firestore";
import { logout } from "../../firebase/auth";
import { useAuth } from "../../shared/hooks/useAuth";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";

/**
 * Who is signed in, as the navigation shows them: a name, an email and two
 * initials for the avatar.
 *
 * Read under the same query key as the currency converter, so there is one copy
 * of the user document in the cache — when Settings saves a new name it writes
 * into that copy, and the sidebar and the menu change with it, without a read.
 */
export function useProfile() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? "";

  const { data: firestoreUser, isFetched } = useQuery({
    queryKey: exchangeRateKeys.user(uid),
    queryFn: () => getUser(uid),
    enabled: !!uid,
    // As the old top bar had it: fetched once when the shell mounts, so a name
    // changed on another device shows up on the next launch.
    staleTime: 0,
  });

  const isGoogle = currentUser?.providerData?.[0]?.providerId === "google.com";

  const displayName = isGoogle
    ? firestoreUser?.firstName
      ? `${firestoreUser.firstName} ${firestoreUser.lastName ?? ""}`.trim()
      : (currentUser?.displayName ?? "")
    : (firestoreUser?.username ?? currentUser?.email?.split("@")[0] ?? "");

  const initials = (() => {
    if (firestoreUser?.firstName) return `${firestoreUser.firstName[0]}${firestoreUser.lastName?.[0] ?? ""}`.toUpperCase();
    if (currentUser?.displayName) {
      return currentUser.displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return (currentUser?.email?.[0] ?? "?").toUpperCase();
  })();

  return {
    signedIn: !!currentUser,
    displayName,
    email: currentUser?.email ?? "",
    initials,
    isGoogle,
    /** Once the document has been read (or failed to be): before that the name would flash from the email's to the real one. */
    loaded: !uid || firestoreUser !== undefined || isFetched,
  };
}

/** Signs out and lands on the login page — from the menu, the sidebar and Settings alike. */
export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };
}
