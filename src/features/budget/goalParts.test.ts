import { describe, it, expect } from "vitest";
import { draftProblem, fillParts, partsFromDrafts, partsTotals } from "./goalParts";
import type { GoalPart } from "../../shared/types/IndexTypes";

// The ski trip: house 150–200, lift 50–90, travel 100–200, food 150–200.

const part = (id: string, min: number, max: number): GoalPart => ({ id, label: id, min, max });
const SKI = [part("house", 150, 200), part("lift", 50, 90), part("travel", 100, 200), part("food", 150, 200)];
const filledOf = (saved: number) => fillParts(SKI, saved).map((f) => f.filled);
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("a goal from parts", () => {
  it("adds up to 450–690, the target being the «έως»", () => {
    expect(partsTotals(SKI)).toEqual({ min: 450, max: 690 });
  });

  it("fills every part to its «από» in order before any goes further", () => {
    // 280: house 150, lift 50, then 80 of travel's 100.
    expect(filledOf(280)).toEqual([150, 50, 80, 0]);
    // 450: every «από» met, nothing above any.
    expect(filledOf(450)).toEqual([150, 50, 100, 150]);
    expect(fillParts(SKI, 450).every((f) => f.reachedMin)).toBe(true);
  });

  it("then fills each up to its «έως», in the same order", () => {
    // 520: the «από» 450, then 50 more of the house, 20 of the lift.
    expect(filledOf(520)).toEqual([200, 70, 100, 150]);
    expect(fillParts(SKI, 690).every((f) => f.full)).toBe(true);
  });

  it("places every euro in the goal, and none twice — up to the «έως» total", () => {
    // A second way: what the parts hold is what was saved, capped at 690.
    for (const saved of [0, 1.5, 199.99, 280, 450, 451.25, 600, 690, 900]) {
      expect(sum(filledOf(saved))).toBe(Math.min(saved, 690));
    }
  });
});

describe("parts as they are typed", () => {
  it("keeps the rows with a name and an «έως»; an empty «από» is the «έως»", () => {
    const parts = partsFromDrafts([
      { id: "a", label: " House ", min: "150", max: "200" },
      { id: "b", label: "Lift", min: "", max: "90" },
      { id: "c", label: "", min: "", max: "" },
      { id: "d", label: "Too much", min: "300", max: "100" },
    ]);
    expect(parts).toEqual([
      { id: "a", label: "House", min: 150, max: 200 },
      { id: "b", label: "Lift", min: 90, max: 90 },
      { id: "d", label: "Too much", min: 100, max: 100 },
    ]);
  });

  it("says what is wrong with a row half written", () => {
    expect(draftProblem({ id: "x", label: "", min: "", max: "" })).toBeUndefined();
    expect(draftProblem({ id: "x", label: "House", min: "", max: "" })).toBe("missing");
    expect(draftProblem({ id: "x", label: "", min: "", max: "200" })).toBe("missing");
    expect(draftProblem({ id: "x", label: "House", min: "300", max: "200" })).toBe("minAboveMax");
    expect(draftProblem({ id: "x", label: "House", min: "150", max: "200" })).toBeUndefined();
  });
});
