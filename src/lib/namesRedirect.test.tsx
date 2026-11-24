import { describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { NamesRedirect } from "./routeGuards";

// «Δικαιούχοι & κατηγορίες» left «Συναλλαγές» for an entry of its own with two
// child routes (owner, 2026-11-19). A link or bookmark on the old address —
// `?tab=` and all — still lands on the page that took its tab over.

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const landsOn = (entry: string) => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/transactions/names" element={<NamesRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  const where = screen.getByTestId("where").textContent;
  cleanup();
  return where;
};

describe("the old «Δικαιούχοι & κατηγορίες» address", () => {
  it("lands on the payees page when it names no tab", () => {
    expect(landsOn("/transactions/names")).toBe("/names/payees");
    // An unknown tab is the same case, not a dead end.
    expect(landsOn("/transactions/names?tab=whatever")).toBe("/names/payees");
  });

  it("lands on the page its ?tab= named, keeping anything else it carried", () => {
    expect(landsOn("/transactions/names?tab=categories")).toBe("/names/categories");
    expect(landsOn("/transactions/names?tab=categories&from=settings")).toBe("/names/categories?from=settings");
  });
});
