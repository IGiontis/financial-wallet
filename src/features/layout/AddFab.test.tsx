import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../../i18n";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { PageAddProvider } from "../../shared/components/PageAddProvider";
import { AddFab } from "./AddFab";

// What the «+» opens: a page's own add where the page has one, the ordinary
// transaction form everywhere else. The forms themselves are tested where they
// live; here they only say they were opened.

vi.mock("../transactions/components/AddTransactionModal", () => ({
  default: ({ onPickTransfer }: { onPickTransfer: () => void }) => (
    <div role="dialog" aria-label="transaction form">
      <button type="button" onClick={onPickTransfer}>
        transfer
      </button>
    </div>
  ),
}));
vi.mock("../transactions/components/TransferWizard", () => ({ default: () => <div role="dialog" aria-label="transfer form" /> }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCategories: () => ({ data: [] }), useCreateTransaction: () => ({}) }));

function GoalsLike({ onAdd }: { onAdd: () => void }) {
  usePageAdd("New goal", onAdd);
  return <h1>Goals</h1>;
}

const renderAt = (path: string, onAdd = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PageAddProvider>
        <Routes>
          <Route path="/goals" element={<GoalsLike onAdd={onAdd} />} />
          <Route path="*" element={<h1>Somewhere</h1>} />
        </Routes>
        <AddFab />
      </PageAddProvider>
    </MemoryRouter>,
  );
  return onAdd;
};

describe("the «+»", () => {
  it("opens the page's own add, and says so, on a page that has one", async () => {
    const onAdd = renderAt("/goals");
    const fab = await screen.findByRole("button", { name: "New goal" });
    await userEvent.click(fab);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "transaction form" })).toBeNull();
  });

  it("opens a new transaction everywhere else, from which a transfer is one tap away", async () => {
    renderAt("/bills");
    await userEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(screen.getByRole("dialog", { name: "transaction form" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "transfer" }));
    expect(screen.getByRole("dialog", { name: "transfer form" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "transaction form" })).toBeNull();
  });

  it("opens the transaction form straight from the app icon's shortcut", () => {
    renderAt("/?quick=expense");
    expect(screen.getByRole("dialog", { name: "transaction form" })).toBeInTheDocument();
  });

  it("is not shown over the full form, which is the same thing as a page", () => {
    renderAt("/transactions/new");
    expect(screen.queryByRole("button", { name: "Add transaction" })).toBeNull();
  });
});
