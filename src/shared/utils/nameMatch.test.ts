import { describe, it, expect } from "vitest";
import { greeklishKey, matchName, matchNameIn, nameKey, oneTypoApart, sameName, similarName, similarPairs } from "./nameMatch";
import { textKey } from "./cleanText";

describe("nameKey: the one rule names are the same by", () => {
  it("is the app's existing textKey — not a second rule", () => {
    for (const s of ["  Ταξίδι  ", "ΣΚΙ   ΔΙΑΚΟΠΈΣ ", "Café"]) expect(nameKey(s)).toBe(textKey(s));
  });

  it("trims, collapses inner spaces, ignores case", () => {
    expect(nameKey("  Σκι    διακοπές ")).toBe("σκι διακοπεσ");
    expect(nameKey("LIDL")).toBe(nameKey("lidl"));
  });

  it("drops Greek τόνοι and διαλυτικά, and final ς is σ", () => {
    expect(nameKey("Δώρο")).toBe("δωρο");
    expect(nameKey("Ταΐζω")).toBe(nameKey("ταιζω"));
    expect(nameKey("ΰ")).toBe("υ");
    expect(nameKey("Καφές")).toBe("καφεσ");
    expect(nameKey("ΚΑΦΕΣ")).toBe(nameKey("καφες"));
  });

  it("«Δώρο», «δωρο» and « ΔΩΡΟ » are one name; «Δώρα» is not", () => {
    expect(sameName("Δώρο", "δωρο")).toBe(true);
    expect(sameName("Δώρο", " ΔΩΡΟ ")).toBe(true);
    expect(sameName("Δώρο", "Δώρα")).toBe(false);
    expect(sameName("", "  ")).toBe(false);
  });
});

describe("greeklishKey: one rough sound key for both alphabets", () => {
  it.each([
    ["Δώρο", "doro"],
    ["Doro", "doro"],
    ["dwro", "doro"],
    ["Σκλαβενίτης", "sklavenitis"],
    ["Sklavenitis", "sklavenitis"],
    ["Θεσσαλονίκη", "8esaloniki"],
    ["Thessaloniki", "8esaloniki"],
    ["8essaloniki", "8esaloniki"],
    ["Χαρά", "xara"],
    ["Chara", "xara"],
    ["Ξύδι", "xidi"],
    ["Ksydi", "xidi"],
    ["Ψωμί", "psomi"],
    ["Μπάμπης", "babis"],
    ["Mpampis", "babis"],
    ["Ντίνος", "dinos"],
    ["Ntinos", "dinos"],
    ["Ουρανός", "uranos"],
    ["Ouranos", "uranos"],
    ["Αιγαίο", "egeo"],
    ["Aigaio", "egeo"],
    ["Βασιλόπουλος", "vasilopulos"],
    ["Vassilopoulos", "vasilopulos"],
    ["Καφές", "kafes"],
    ["Kafes", "kafes"],
    ["Cafes", "kafes"],
  ])("%s → %s", (name, key) => expect(greeklishKey(name)).toBe(key));

  it("drops spaces and punctuation", () => {
    expect(greeklishKey("Ταβέρνα «Το Στέκι»")).toBe(greeklishKey("taverna to steki"));
  });
});

describe("oneTypoApart", () => {
  it.each([
    ["vodafone", "vodafon", true],
    ["vodafone", "vodaffone", true],
    ["vodafone", "vodafane", true],
    ["vodafone", "vodaofne", true],
    ["vodafone", "vdaofne", false],
    ["abc", "abc", true],
    ["abcd", "ab", false],
  ])("%s ~ %s: %s", (a, b, expected) => {
    expect(oneTypoApart(a, b)).toBe(expected);
    expect(oneTypoApart(b, a)).toBe(expected);
  });
});

describe("similarName: probably the same, never the same", () => {
  it("Greeklish and one-typo spellings are similar", () => {
    expect(similarName("Doro", "Δώρο")).toBe(true);
    expect(similarName("Δόρο", "Δώρο")).toBe(true);
    expect(similarName("Vodafon", "Vodafone")).toBe(true);
  });

  it("the same name is not «similar» — it is the same", () => {
    expect(similarName("δωρο", "Δώρο")).toBe(false);
  });

  it("short words a letter apart are left alone", () => {
    expect(similarName("ΔΕΗ", "ΔΕΣ")).toBe(false);
    expect(similarName("Lidl", "Shell")).toBe(false);
  });
});

describe("matchName: refuse the same, suggest the similar", () => {
  const payees = ["Δώρο", "Lidl", "Vodafone"];

  it("an exact duplicate is the same — the caller refuses it and offers the one there", () => {
    expect(matchNameIn(" ΔΩΡΟ ", payees)).toEqual({ kind: "same", item: "Δώρο", name: "Δώρο" });
  });

  it("Greeklish or a typo is only similar — a suggestion", () => {
    expect(matchNameIn("dwro", payees)).toEqual({ kind: "similar", item: "Δώρο", name: "Δώρο" });
    expect(matchNameIn("Vodafon", payees)?.kind).toBe("similar");
  });

  it("a new name meets nothing", () => {
    expect(matchNameIn("Σκλαβενίτης", payees)).toBeNull();
    expect(matchNameIn("   ", payees)).toBeNull();
  });

  it("the item being renamed is never its own clash", () => {
    expect(matchNameIn("δώρο", payees, "Δώρο")).toBeNull();
  });

  it("answers to every way an item is written (a built-in category in each language)", () => {
    const categories = [{ id: "coffee", names: ["Coffee", "Καφές"] }];
    const hit = matchName("καφες", categories, (c) => c.names);
    expect(hit).toMatchObject({ kind: "same", item: categories[0] });
    expect(matchName("Kafes", categories, (c) => c.names)).toMatchObject({ kind: "similar", item: categories[0] });
  });

  it("prefers a Greeklish reading over a typo reading", () => {
    // «Doro» is Greeklish for «Δώρο» and one typo from «Dora».
    expect(matchNameIn("Doro", ["Dora", "Δώρο"])).toMatchObject({ kind: "similar", item: "Δώρο" });
  });
});

describe("similarPairs: what the names page offers to merge", () => {
  it("pairs names written two ways, each pair once", () => {
    const names = ["Σκλαβενίτης", "Lidl", "Sklavenitis", "Vodafone", "Vodafon"];
    expect(similarPairs(names, (n) => [n])).toEqual([
      ["Σκλαβενίτης", "Sklavenitis"],
      ["Vodafone", "Vodafon"],
    ]);
  });

  it("respects canPair", () => {
    expect(similarPairs(["Doro", "Δώρο"], (n) => [n], () => false)).toEqual([]);
  });
});
