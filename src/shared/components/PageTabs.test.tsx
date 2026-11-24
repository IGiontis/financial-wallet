import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PageTabs, type PageTabLink } from "./PageTabs";
import { PageHeader } from "./PageHeader";
import { pageTabIds } from "../utils/pageTabIds";

// The one tab strip every page uses: as a tablist (state tabs) and as the
// section's links (child routes, with a count). One look, so one markup: the
// same box class on a button and on a link.

type Tab = "a" | "b" | "c";
const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
] as const satisfies readonly { id: Tab; label: string }[];

function StateHarness({ start = "a" as Tab }) {
  const [tab, setTab] = useState<Tab>(start);
  const ids = pageTabIds("t", tab);
  return (
    <MemoryRouter>
      <PageTabs base="t" label="Things" tabs={TABS} value={tab} onChange={setTab} data-tour="things" />
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab}>
        panel {tab}
      </div>
    </MemoryRouter>
  );
}

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const LINKS: PageTabLink[] = [
  { to: "/bills", label: "Summary" },
  { to: "/bills/pay", label: "Pay", badge: 12, badgeLabel: "12 due" },
  { to: "/bills/manage", label: "Manage (3)" },
  { to: "/bills/all", label: "All", badge: 2, badgeTone: "warning" },
];

const renderLinks = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <PageTabs label="Bills" links={LINKS} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe("PageTabs — state tabs", () => {
  it("is a tablist whose chosen tab labels the panel, and only the chosen one is in the Tab order", () => {
    render(<StateHarness start="b" />);
    const list = screen.getByRole("tablist", { name: "Things" });
    expect(list).toHaveAttribute("data-tour", "things");
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(beta).toHaveAttribute("aria-selected", "true");
    expect(beta).toHaveAttribute("tabindex", "0");
    expect(beta).toHaveAttribute("data-view", "b");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
    // Tab and panel point at each other.
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Beta");
    expect(beta).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
  });

  it("moves and chooses with the arrow keys, wrapping round, and Home / End", async () => {
    render(<StateHarness />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("panel b")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
  });

  it("chooses on a click", async () => {
    render(<StateHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(screen.getByText("panel c")).toBeInTheDocument();
  });
});

describe("PageTabs — link tabs", () => {
  it("marks the page it is on, and only that one («end»: the section's root is not every page)", () => {
    renderLinks("/bills/pay");
    const nav = screen.getByRole("navigation", { name: "Bills" });
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/bills/pay");
  });

  it("goes to the page on a click", async () => {
    renderLinks("/bills");
    await userEvent.click(screen.getByRole("link", { name: "Manage (3)" }));
    expect(screen.getByTestId("where").textContent).toBe("/bills/manage");
  });

  it("puts a count on a tab, read out with its meaning, 9+ past nine, in the tone asked", () => {
    renderLinks("/bills");
    const pay = screen.getByRole("link", { name: "Pay — 12 due" });
    expect(pay).toHaveTextContent("9+");
    expect(pay.querySelector(".badge")).toHaveClass("text-bg-danger");
    // No meaning given: the number is what is read out.
    const all = screen.getByRole("link", { name: "All — 2" });
    expect(all.querySelector(".badge")).toHaveClass("text-bg-warning");
    // No count, no badge and no extra name.
    expect(screen.getByRole("link", { name: "Summary" }).querySelector(".badge")).toBeNull();
  });

  it("draws a link the way it draws a tab: the same box", () => {
    renderLinks("/bills");
    const link = screen.getByRole("link", { name: "Summary" });
    const { container } = render(<StateHarness />);
    const tab = container.querySelector('[role="tab"]')!;
    const box = (el: Element) => [...el.classList].filter((c) => !/active/i.test(c)).sort();
    expect(box(link)).toEqual(box(tab));
  });
});

// In the page header's band the tabs are the band's BASE — underlines on its
// bottom edge, not boxes (owner, 2026-11-24, «option Β»). The page passes
// nothing: the strip asks the band it is in (`useInPageBand`), and marks itself
// `data-band` so the band's own stylesheet can put it on that edge.
describe("PageTabs — the band's base", () => {
  const inBand = (ui: React.ReactElement) =>
    render(
      <MemoryRouter>
        <PageHeader title="Στόχοι">{ui}</PageHeader>
      </MemoryRouter>,
    );

  it("state tabs in the header mark themselves as the band's row", () => {
    inBand(<PageTabs base="t" label="Things" tabs={TABS} value="a" onChange={() => undefined} />);
    const list = screen.getByRole("tablist", { name: "Things" });
    expect(list).toHaveAttribute("data-band");
    expect([...list.classList].some((c) => /band/i.test(c))).toBe(true);
  });

  it("link tabs in the header do the same — one look for both kinds", () => {
    inBand(<PageTabs label="Bills" links={LINKS} />);
    const nav = screen.getByRole("navigation", { name: "Bills" });
    expect(nav).toHaveAttribute("data-band");
    expect([...nav.classList].some((c) => /band/i.test(c))).toBe(true);
  });

  it("keeps the boxes anywhere else: no band marker outside the header", () => {
    render(<StateHarness />);
    const list = screen.getByRole("tablist", { name: "Things" });
    expect(list).not.toHaveAttribute("data-band");
    expect([...list.classList].some((c) => /band/i.test(c))).toBe(false);
  });
});
