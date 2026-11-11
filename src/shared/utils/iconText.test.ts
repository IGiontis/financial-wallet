import { describe, expect, it } from "vitest";
import { graphemes, iconProblem, isSingleIcon } from "./iconText";
import { DEFAULT_CATEGORIES } from "../../firebase/defaultCategories";
import { PRESET_ICONS } from "../../features/budget/components/goalWizardSteps";

describe("isSingleIcon", () => {
  it("accepts one emoji, however many code units it takes", () => {
    for (const icon of ["💰", "✈️", "👍🏽", "👨‍👩‍👧", "🇬🇷", "❤️", " 🏠 "]) expect(isSingleIcon(icon), icon).toBe(true);
  });

  it("refuses letters, words, digits and more than one emoji", () => {
    for (const text of ["", " ", "A", "Σ", "ab", "Ταξίδι", "1", "💰💰", "💰a", "a💰"]) expect(isSingleIcon(text), text).toBe(false);
  });

  it("counts a family as one picture, not eight code units", () => {
    expect("👨‍👩‍👧".length).toBeGreaterThan(4);
    expect(graphemes("👨‍👩‍👧")).toHaveLength(1);
  });
});

describe("iconProblem", () => {
  it("an empty optional icon is fine; text is not", () => {
    expect(iconProblem("")).toBeUndefined();
    expect(iconProblem("🎯")).toBeUndefined();
    expect(iconProblem("Ταξίδι")).toBe("validation.iconOnlyOne");
  });

  it("every icon the app offers or seeds passes its own check", () => {
    for (const icon of PRESET_ICONS) expect(isSingleIcon(icon), icon).toBe(true);
    for (const c of DEFAULT_CATEGORIES) expect(isSingleIcon(c.icon ?? "🧾"), c.name).toBe(true);
  });
});
