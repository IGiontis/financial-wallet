import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "./PageHeader";

/** The header is a link in the back case, so it always renders inside a router. */
function show(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PageHeader — the one header every page wears", () => {
  it("is the title alone when nothing else is given", () => {
    show(<PageHeader title="Στατιστικά" />);
    expect(screen.getByRole("heading", { level: 1, name: "Στατιστικά" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("puts the «+» first and the title after it, with its one line under", () => {
    const onAdd = vi.fn();
    show(<PageHeader title="Στόχοι" subtitle="Βάλε λεφτά στην άκρη" addLabel="Νέος στόχος" onAdd={onAdd} />);
    const add = screen.getByRole("button", { name: "Νέος στόχος" });
    const heading = screen.getByRole("heading", { level: 1, name: "Στόχοι" });
    expect(add.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Βάλε λεφτά στην άκρη")).toBeInTheDocument();
  });

  it("the «+» runs the page's add, once per press", async () => {
    const onAdd = vi.fn();
    show(<PageHeader title="Πάγια" addLabel="Νέο πάγιο" onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "Νέο πάγιο" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("the «+» can be greyed out — offline, or nothing more can be added", async () => {
    const onAdd = vi.fn();
    show(<PageHeader title="Δουλειά" addLabel="Νέα δουλειά" onAdd={onAdd} addDisabled />);
    const add = screen.getByRole("button", { name: "Νέα δουλειά" });
    expect(add).toBeDisabled();
    await userEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows the page's actions on the right", () => {
    show(<PageHeader title="Τράπεζες" actions={<button type="button">Ενημέρωση</button>} />);
    expect(screen.getByRole("button", { name: "Ενημέρωση" })).toBeInTheDocument();
  });

  it("a record page gets its way back, a real link", () => {
    show(<PageHeader title="Χρέη › Δέσποινα" backTo="/debts" backLabel="Πίσω" />);
    expect(screen.getByRole("link", { name: /Πίσω/ })).toHaveAttribute("href", "/debts");
  });

  it("holds the page's row of tabs or selectors inside the same card", () => {
    const { container } = show(
      <PageHeader title="Επισκόπηση" subtitle="Σήμερα">
        <div data-testid="tabs">tabs</div>
      </PageHeader>,
    );
    const card = container.querySelector("section");
    const tabs = screen.getByTestId("tabs");
    expect(card).not.toBeNull();
    expect(card?.contains(tabs)).toBe(true);
    // The heading is in the same card, above them.
    expect(card?.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
    expect(screen.getByRole("heading", { level: 1 }).compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no row when the page has no tabs", () => {
    const { container } = show(<PageHeader title="Βιβλίο κινήσεων" subtitle="Μόνο για ανάγνωση" />);
    expect(container.querySelector("section")?.children).toHaveLength(1);
  });
});
