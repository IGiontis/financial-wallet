import { describe, it, expect } from "vitest";
import { greekVocative, lastOpenWords } from "./welcomeWords";

describe("greekVocative", () => {
  it.each([
    ["Ηλίας", "Ηλία"],
    ["Λουκάς", "Λουκά"],
    ["Γιάννης", "Γιάννη"],
    ["Θανάσης", "Θανάση"],
    ["Νίκος", "Νίκο"],
    ["Γιώργος", "Γιώργο"],
    ["Στέλιος", "Στέλιο"],
    ["Παύλος", "Παύλο"],
    ["Αλέξανδρος", "Αλέξανδρε"],
    ["Θεόδωρος", "Θεόδωρε"],
  ])("%s → %s", (name, vocative) => {
    expect(greekVocative(name)).toBe(vocative);
  });

  it.each(["Κατερίνα", "Μαρία", "Ελένη", "Ilias", "Nikos", "ΝΙΚΟΣ", "Μαρία Ελένη", "Θεός"])("leaves %s as typed", (name) => {
    expect(greekVocative(name)).toBe(name);
  });

  it("drops the -ς of a name in capitals, where the ending is regular", () => {
    expect(greekVocative("ΗΛΙΑΣ")).toBe("ΗΛΙΑ");
  });
});

describe("lastOpenWords", () => {
  const now = new Date(2026, 10, 3, 0, 10);
  it("counts calendar days: last night is yesterday", () => {
    expect(lastOpenWords(new Date(2026, 10, 2, 23, 50), now, "en")).toBe("yesterday");
    expect(lastOpenWords(new Date(2026, 10, 2, 23, 50), now, "el")).toBe("χθες");
  });

  it("says today, then days ago, then the date", () => {
    expect(lastOpenWords(new Date(2026, 10, 3, 0, 1), now, "en")).toBe("today");
    expect(lastOpenWords(new Date(2026, 9, 31), now, "en")).toBe("3 days ago");
    expect(lastOpenWords(new Date(2026, 9, 20), now, "en")).toBe("October 20");
    expect(lastOpenWords(new Date(2025, 9, 20), now, "en")).toBe("October 20, 2025");
  });
});
