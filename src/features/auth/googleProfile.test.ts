import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const createUser = vi.fn();
vi.mock("../../firebase/firestore", () => ({
  getUser: (...args: unknown[]) => getUser(...args),
  createUser: (...args: unknown[]) => createUser(...args),
}));

import { ensureGoogleProfile } from "./googleProfile";

const google = { uid: "abcdefghijklmnop", email: "ilias@example.com", displayName: "Ilias Example" };

beforeEach(() => {
  getUser.mockReset();
  createUser.mockReset().mockResolvedValue(undefined);
});

describe("ensureGoogleProfile", () => {
  it("leaves an existing account untouched", async () => {
    // The register page used to write a fresh profile over this one, wiping the
    // banks, the readings and the planner with it.
    getUser.mockResolvedValue({ id: google.uid, workspace: { "money-accounts": [{ id: "a1" }] } });

    await expect(ensureGoogleProfile(google, "el")).resolves.toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates a profile, in the language on screen, when there is none", async () => {
    getUser.mockResolvedValue(null);

    await expect(ensureGoogleProfile(google, "el")).resolves.toBe(true);
    expect(createUser).toHaveBeenCalledWith(google.uid, {
      email: "ilias@example.com",
      username: "abcdefghijkl",
      firstName: "Ilias",
      lastName: "Example",
      locale: "el",
    });
  });

  it("copes with a Google account that has no name or email", async () => {
    getUser.mockResolvedValue(undefined);

    await ensureGoogleProfile({ uid: "u1", email: null, displayName: null }, "en");
    expect(createUser).toHaveBeenCalledWith("u1", { email: "", username: "u1", firstName: "", lastName: "", locale: "en" });
  });

  it("does not create anything when the lookup itself fails", async () => {
    // Offline or refused: not knowing is not the same as "no profile".
    getUser.mockRejectedValue(new Error("unavailable"));

    await expect(ensureGoogleProfile(google, "el")).rejects.toThrow("unavailable");
    expect(createUser).not.toHaveBeenCalled();
  });
});
