import { describe, it, expect } from "vitest";
import { DISPLAY_NAME_MAX, cleanDisplayName, resolveDisplayName } from "./displayName";

const base = { isGoogle: false, firstName: "Ilias", lastName: "Giontis", username: "ilias_g", email: "ilias@example.com" };

describe("resolveDisplayName", () => {
  it("shows the name set in Settings first, for any account", () => {
    expect(resolveDisplayName({ ...base, custom: "Λιάκος" })).toBe("Λιάκος");
    expect(resolveDisplayName({ ...base, isGoogle: true, googleName: "Ilias G.", custom: "Λιάκος" })).toBe("Λιάκος");
  });

  it("then, for a Google account, Google's name", () => {
    expect(resolveDisplayName({ ...base, isGoogle: true, googleName: "Ilias Giontis (Google)" })).toBe("Ilias Giontis (Google)");
  });

  it("for a Google account without one, the names on the profile", () => {
    expect(resolveDisplayName({ ...base, isGoogle: true, googleName: null })).toBe("Ilias Giontis");
  });

  it("otherwise the username, then the email's part before the @", () => {
    expect(resolveDisplayName(base)).toBe("ilias_g");
    expect(resolveDisplayName({ ...base, username: "" })).toBe("ilias");
    // A Google name is not used for an email account.
    expect(resolveDisplayName({ ...base, googleName: "Someone" })).toBe("ilias_g");
  });

  it("treats a blank name set in Settings as none", () => {
    expect(resolveDisplayName({ ...base, custom: "   " })).toBe("ilias_g");
    expect(resolveDisplayName({ ...base, custom: "" })).toBe("ilias_g");
  });
});

describe("cleanDisplayName", () => {
  it("trims, and makes inner runs of spaces one", () => {
    expect(cleanDisplayName("  Ηλίας   Γ.  ")).toBe("Ηλίας Γ.");
  });

  it("is never longer than the limit, counting letters rather than code units", () => {
    expect(DISPLAY_NAME_MAX).toBe(24);
    const long = "Α".repeat(30);
    expect(cleanDisplayName(long)).toHaveLength(24);
    // Emoji are one each, never cut in half.
    expect(Array.from(cleanDisplayName("😀".repeat(30)))).toHaveLength(24);
    expect(cleanDisplayName("x".repeat(24))).toBe("x".repeat(24));
  });

  it("does not leave a space at the end where the cut fell", () => {
    expect(cleanDisplayName(`${"a".repeat(23)} b`)).toBe("a".repeat(23));
  });

  it("is empty for nothing", () => {
    expect(cleanDisplayName(undefined)).toBe("");
    expect(cleanDisplayName(null)).toBe("");
  });
});
