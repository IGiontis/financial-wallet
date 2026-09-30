import { describe, expect, it } from "vitest";
import { localeUpperCase } from "./upperCase";

describe("localeUpperCase", () => {
  it("drops the Greek accent in capitals", () => {
    expect(localeUpperCase("Ημερομηνία", "el")).toBe("ΗΜΕΡΟΜΗΝΙΑ");
    expect(localeUpperCase("Ποσό", "el")).toBe("ΠΟΣΟ");
    expect(localeUpperCase("Δικαιούχος", "el")).toBe("ΔΙΚΑΙΟΥΧΟΣ");
    expect(localeUpperCase("Κατηγορία", "el")).toBe("ΚΑΤΗΓΟΡΙΑ");
    expect(localeUpperCase("Έως", "el")).toBe("ΕΩΣ");
  });

  it("leaves no combining accent behind", () => {
    expect(localeUpperCase("Ενέργειες", "el").normalize("NFD")).not.toMatch(/́/);
  });

  it("keeps an accented vowel and the ι/υ after it apart with a dialytika", () => {
    // Without it ΜΑΙΟΣ would read as the diphthong αι.
    expect(localeUpperCase("Μάιος", "el")).toBe("ΜΑΪΟΣ");
    expect(localeUpperCase("ρολόι", "el")).toBe("ΡΟΛΟΪ");
    expect(localeUpperCase("άυλος", "el")).toBe("ΑΫΛΟΣ");
  });

  it("does not add a dialytika where the accent belongs to the ι itself", () => {
    expect(localeUpperCase("είναι", "el")).toBe("ΕΙΝΑΙ");
    expect(localeUpperCase("Ιανουάριος", "el")).toBe("ΙΑΝΟΥΑΡΙΟΣ");
  });

  it("keeps a dialytika that is already there", () => {
    expect(localeUpperCase("καΐκι", "el")).toBe("ΚΑΪΚΙ");
    expect(localeUpperCase("Αϊ", "el")).toBe("ΑΪ");
    // The common misspelling with both marks must not end up with two.
    expect(localeUpperCase("Μάϊος", "el")).toBe("ΜΑΪΟΣ");
  });

  it("also covers regional Greek codes", () => {
    expect(localeUpperCase("Ποσό", "el-GR")).toBe("ΠΟΣΟ");
  });

  it("upper-cases English plainly", () => {
    expect(localeUpperCase("Date", "en")).toBe("DATE");
    expect(localeUpperCase("Actions", undefined)).toBe("ACTIONS");
  });
});
