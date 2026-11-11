import { describe, it, expect } from "vitest";
import { carryEvery, EVERY_MAX } from "./EveryPicker";

// Changing the unit of «Κάθε πότε» keeps the gap as near as the new list
// allows — never the same number in a bigger unit (6 months → 6 years).
describe("carryEvery", () => {
  it("keeps the same gap when the new unit can say it", () => {
    expect(carryEvery("yearly", 2, "monthly")).toBe(11); // 24 months is past the list: its largest
    expect(carryEvery("monthly", 12, "yearly")).toBe(1);
    expect(carryEvery("monthly", 24, "yearly", 2)).toBe(2);
  });

  it("never turns 6 months into 6 years", () => {
    expect(carryEvery("monthly", 6, "yearly")).toBe(1);
    expect(carryEvery("monthly", 6, "yearly", 2)).toBe(2);
    expect(carryEvery("monthly", 6, "weekly")).toBe(EVERY_MAX.weekly);
    expect(carryEvery("weekly", 2, "monthly")).toBe(1);
  });

  it("stays inside the new unit's list, from its minimum", () => {
    for (const unit of ["weekly", "monthly", "yearly"] as const)
      for (const next of ["weekly", "monthly", "yearly"] as const)
        for (let count = 1; count <= EVERY_MAX[unit]; count++) {
          const carried = carryEvery(unit, count, next, 2);
          expect(carried).toBeGreaterThanOrEqual(Math.min(2, EVERY_MAX[next]));
          expect(carried).toBeLessThanOrEqual(EVERY_MAX[next]);
        }
  });
});
