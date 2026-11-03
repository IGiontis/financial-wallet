import { describe, it, expect } from "vitest";
import { incomeEndsOn, incomeStartsLater, type Income } from "./incomesUtils";
import { incomeStartText, makeFormats } from "./incomeText";
import i18n from "../../i18n";

// 2 November 2026: a rent income set up to start on 1 March.
const NOW = new Date(2026, 10, 2, 10);
const rent: Income = { id: "rent", name: "Rent", kind: "rent", amount: 350, frequency: "monthly", day: 1, start: "2027-03" };

describe("an income that starts later", () => {
  it("knows its first time, and that it is still ahead", () => {
    expect(incomeStartsLater(rent, NOW)).toEqual(new Date(2027, 2, 1));
  });

  it("is running once its first time has come — and one starting this month, not yet come, is not", () => {
    expect(incomeStartsLater({ ...rent, start: "2026-01" }, NOW)).toBeUndefined();
    // Starting this month on the 25th: the first time is still ahead.
    expect(incomeStartsLater({ ...rent, start: "2026-11", day: 25 }, NOW)).toEqual(new Date(2026, 10, 25));
  });

  it("says so in words: the date with its year, and how far off", async () => {
    await i18n.changeLanguage("en");
    expect(incomeStartText(rent, NOW, i18n.t, makeFormats("en"))).toBe("Starts 1 Mar 2027 · in 4 months");
    await i18n.changeLanguage("el");
    expect(incomeStartText(rent, NOW, i18n.t, makeFormats("el"))).toMatch(/^Ξεκινά 1 Μαρ 2027 · σε 4 μήνες$/);
  });

  it("names its last month while that is still to come", () => {
    expect(incomeEndsOn({ end: "2027-06" }, NOW)).toEqual(new Date(2027, 5, 1));
    expect(incomeEndsOn({ end: "2026-09" }, NOW)).toBeUndefined();
    expect(incomeEndsOn({}, NOW)).toBeUndefined();
  });
});
