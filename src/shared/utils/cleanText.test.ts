import { describe, expect, it } from "vitest";
import { serverTimestamp } from "firebase/firestore";
import { cleanLine, cleanText, cleanTextFields, textKey } from "./cleanText";

describe("cleanText", () => {
  it("trims the ends and collapses runs of spaces and tabs to one", () => {
    expect(cleanText("  Σκι   διακοπές  ")).toBe("Σκι διακοπές");
    expect(cleanText("\tΣκι \t διακοπές\t")).toBe("Σκι διακοπές");
  });

  it("keeps a note's line breaks, trimming each line, and at most one empty line between paragraphs", () => {
    expect(cleanText("  πρώτη   γραμμή  \r\n  δεύτερη  ")).toBe("πρώτη γραμμή\nδεύτερη");
    expect(cleanText("\n\nα\n\n\n\nβ\n\n")).toBe("α\n\nβ");
  });

  it("leaves nothing of a value that was only spaces", () => {
    expect(cleanText("   ")).toBe("");
    expect(cleanLine(" \n ")).toBe("");
  });

  it("is idempotent: cleaning twice changes nothing more", () => {
    const once = cleanText("  α   β \n\n\n γ  ");
    expect(cleanText(once)).toBe(once);
  });
});

describe("cleanLine", () => {
  it("turns any whitespace, line breaks too, into single spaces", () => {
    expect(cleanLine("  Σκι \n  διακοπές  ")).toBe("Σκι διακοπές");
  });
});

describe("textKey", () => {
  it("compares names ignoring case, accents, final sigma and extra spaces", () => {
    expect(textKey("  Σκι   Διακοπές  ")).toBe(textKey("σκι διακοπες"));
    expect(textKey("Φως")).toBe(textKey("ΦΩΣ"));
    expect(textKey("Café")).toBe("cafe");
  });

  it("still tells different names apart", () => {
    expect(textKey("Σκι")).not.toBe(textKey("Σκι διακοπές"));
  });
});

describe("cleanTextFields", () => {
  it("cleans the user-text fields at any depth and leaves everything else alone", () => {
    const date = new Date(2026, 0, 2);
    const stamp = serverTimestamp();
    const out = cleanTextFields({
      name: "  Σκι   διακοπές  ",
      notes: "  α  \n\n\n  β  ",
      categoryId: "  id  ",
      amount: 12.5,
      date,
      createdAt: stamp,
      parts: [{ label: "  Δωμάτια  ", max: 300 }],
      pause: { from: "2026-01" },
    });
    expect(out).toEqual({
      name: "Σκι διακοπές",
      notes: "α\n\nβ",
      categoryId: "  id  ",
      amount: 12.5,
      date,
      createdAt: stamp,
      parts: [{ label: "Δωμάτια", max: 300 }],
      pause: { from: "2026-01" },
    });
    // Class instances pass through as the same object, not a copy.
    expect(out.date).toBe(date);
    expect(out.createdAt).toBe(stamp);
  });

  it("passes plain values and lists of names through", () => {
    expect(cleanTextFields("  x  ")).toBe("  x  ");
    expect(cleanTextFields(null)).toBeNull();
    expect(cleanTextFields([{ name: " a " }])).toEqual([{ name: "a" }]);
  });
});
