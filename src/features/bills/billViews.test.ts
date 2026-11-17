import { describe, it, expect } from "vitest";
import { billViewFrom, billViewFromOld } from "./billViews";

// Seven views became three (2026-11-17): what a device remembered must open on
// the view that took it in, never on nothing.
describe("the view a device remembered", () => {
  it("reads the old seven as the new four", () => {
    expect(["cards", "list", "tiles"].map(billViewFromOld)).toEqual(["list", "list", "list"]);
    expect(billViewFromOld("timeline")).toBe("month");
    // «Χρονολόγιο» is gone: the list.
    expect(billViewFromOld("tree")).toBe("list");
    expect(["months", "cost"].map(billViewFromOld)).toEqual(["year", "year"]);
    expect([undefined, null, 3, "x"].map(billViewFromOld)).toEqual(["list", "list", "list", "list"]);
  });

  it("keeps a new choice as it is, and anything else as the list", () => {
    expect(["list", "month", "year"].map(billViewFrom)).toEqual(["list", "month", "year"]);
    // A «timeline» kept by the four-view build, and anything else: the list.
    expect(["timeline", "cards", "tree", null].map(billViewFrom)).toEqual(["list", "list", "list", "list"]);
  });
});
