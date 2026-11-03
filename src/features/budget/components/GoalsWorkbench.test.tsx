import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import i18n from "../../../i18n";
import { GoalsWorkbench } from "./GoalsWorkbench";
import type { GoalStatusOption } from "./goalOverview";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// The three tabs of a goal screen: the tab in the address and on the device,
// a real tablist, and each list tab with its own search and its own «All ▾».

const g = (id: string, name: string, over: Partial<InvestmentGoalWithStats> = {}) =>
  ({ id, name, isActive: true, isCompleted: false, goalType: "targeted", totalSaved: 0, ...over }) as InvestmentGoalWithStats;

const GOALS = [g("a", "Trip"), g("b", "Laptop", { isActive: false }), g("c", "Phone", { isCompleted: true }), g("d", "Tent")];

const STATUSES: GoalStatusOption[] = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "Active", test: (x) => x.isActive && !x.isCompleted },
  { id: "paused", label: "Paused", test: (x) => !x.isActive && !x.isCompleted },
  { id: "completed", label: "Completed", test: (x) => x.isCompleted },
];

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.search}</output>;
}

const renderAt = (url = "/goals") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <GoalsWorkbench
        screen="goals"
        title="Goals"
        subtitle=""
        action={null}
        goals={GOALS}
        isLoading={false}
        isError={false}
        statuses={STATUSES}
        overview={<p>the overview</p>}
        searchPlaceholder="Search goals"
        groupOptions={["deadline", "progress"]}
        groupBy="deadline"
        onGroupBy={() => {}}
        renderCards={(shown) => <ul aria-label="cards">{shown.map((x) => <li key={x.id}>{x.name}</li>)}</ul>}
        renderList={(shown) => <ul aria-label="list">{shown.map((x) => <li key={x.id}>{x.name}</li>)}</ul>}
        empty={<p>no goals</p>}
      />
      <Where />
    </MemoryRouter>,
  );

const names = (label: string) => within(screen.getByRole("list", { name: label })).getAllByRole("listitem").map((li) => li.textContent);

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => localStorage.clear());

describe("the goal screen's tabs", () => {
  it("opens on the overview the first time, and says so in the address", () => {
    renderAt();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("the overview")).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("?tab=overview");
  });

  it("keeps the chosen tab in the address and on the device", async () => {
    const { unmount } = renderAt();
    await userEvent.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.getByTestId("where").textContent).toBe("?tab=list");
    expect(JSON.parse(localStorage.getItem("goals:tab")!)).toBe("list");
    unmount();
    // Back from the menu, with no tab in the address: where it was left.
    renderAt("/goals");
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("where").textContent).toBe("?tab=list");
  });

  it("takes the address over the device, and remembers what it asked for", () => {
    localStorage.setItem("goals:tab", JSON.stringify("list"));
    renderAt("/goals?tab=cards");
    expect(screen.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(localStorage.getItem("goals:tab")!)).toBe("cards");
  });

  it("ignores a tab it does not have, and lands a former list reader on the list", () => {
    localStorage.setItem("goals:view", JSON.stringify("stacks"));
    renderAt("/goals?tab=nonsense");
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
  });

  it("is a tablist the arrow keys, Home and End move through", async () => {
    renderAt();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Cards" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    // The panel is the one the chosen tab names.
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", screen.getByRole("tab", { name: "Overview" }).id);
  });
});

describe("a tab of goals", () => {
  it("filters by the status menu, with each choice's count", async () => {
    renderAt("/goals?tab=cards");
    expect(names("cards")).toEqual(["Trip", "Laptop", "Phone", "Tent"]);
    await userEvent.click(screen.getByRole("button", { name: "Status: All" }));
    const items = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(items).toEqual(["All (4)", "Active (2)", "Paused (1)", "Completed (1)"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Paused (1)" }));
    expect(names("cards")).toEqual(["Laptop"]);
    expect(screen.getByRole("button", { name: "Status: Paused" })).toBeInTheDocument();
  });

  it("offers every status back when one leaves the tab empty", async () => {
    renderAt("/goals?tab=cards");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search goals" }), "Laptop");
    await userEvent.click(screen.getByRole("button", { name: "Status: All" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Completed (1)" }));
    expect(screen.queryByRole("list", { name: "cards" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show «All»" }));
    expect(names("cards")).toEqual(["Laptop"]);
  });

  it("keeps its own search and status: the list is not filtered by the cards", async () => {
    renderAt("/goals?tab=cards");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search goals" }), "t");
    await userEvent.click(screen.getByRole("button", { name: "Status: All" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Active (2)" }));
    expect(names("cards")).toEqual(["Trip", "Tent"]);

    await userEvent.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.getByRole("searchbox", { name: "Search goals" })).toHaveValue("");
    expect(names("list")).toEqual(["Trip", "Laptop", "Phone", "Tent"]);
    // Grouping is the list's alone.
    expect(screen.getByRole("button", { name: "Group by: Deadline" })).toBeInTheDocument();

    // And back on the cards, what was typed there is still there.
    await userEvent.click(screen.getByRole("tab", { name: "Cards" }));
    expect(screen.getByRole("searchbox", { name: "Search goals" })).toHaveValue("t");
    expect(names("cards")).toEqual(["Trip", "Tent"]);
    expect(screen.queryByRole("button", { name: /Group by/ })).toBeNull();
  });
});
