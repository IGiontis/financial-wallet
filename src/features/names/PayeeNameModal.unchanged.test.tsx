import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { PayeeNameModal, type PayeeRenameVars } from "./PayeeNameModal";
import type { PayeeRow } from "./payeeNames";
import type { Transaction } from "../../shared/types/IndexTypes";

// «No change, no Save» on renaming a payee (the owner, 2026-11-16): a rename to
// the name it already has — spaces aside — is not offered; another name is;
// the old name typed back is not offered again.

const row: PayeeRow = { name: "Coffee Island", key: "coffee island", count: 2, saved: true };
const other: PayeeRow = { name: "Lidl", key: "lidl", count: 5, saved: false };
const day = new Date(2026, 9, 1);
const transactions = [
  { id: "t1", userId: "u", amount: 3, type: "expense", categoryId: "food", date: day, description: "Coffee Island", createdAt: day, updatedAt: day },
  { id: "t2", userId: "u", amount: 4, type: "expense", categoryId: "food", date: day, description: "Coffee Island", createdAt: day, updatedAt: day },
] as Transaction[];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

function open() {
  const onRename = vi.fn<(vars: PayeeRenameVars) => Promise<undefined>>(async () => undefined);
  render(<PayeeNameModal mode="rename" row={row} rows={[row, other]} transactions={transactions} saved={["Coffee Island"]} onClose={() => {}} onAdd={vi.fn()} onRename={onRename} onShow={vi.fn()} />);
  return onRename;
}

const nextButton = () => screen.getByRole("button", { name: /^Next/ });
const field = () => screen.getByRole("textbox");

describe("renaming a payee — No change, no Save", () => {
  it("opens on its own name: Next off, with «Nothing has changed»; a trailing space is still no change", async () => {
    open();
    expect(nextButton()).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();
    await userEvent.type(field(), "  ");
    expect(nextButton()).toBeDisabled();
  });

  it("another name turns it on; the old name typed back turns it off again", async () => {
    const onRename = open();
    await userEvent.clear(field());
    await userEvent.type(field(), "Coffee Island Kifisia");
    expect(nextButton()).toBeEnabled();
    expect(screen.queryByText("Nothing has changed")).toBeNull();

    await userEvent.clear(field());
    await userEvent.type(field(), "Coffee Island");
    expect(nextButton()).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onRename).not.toHaveBeenCalled();
  });

  it("a real rename reaches the review and is saved once", async () => {
    const onRename = open();
    await userEvent.clear(field());
    await userEvent.type(field(), "Coffee Isle");
    await userEvent.click(nextButton());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename.mock.calls[0][0]).toMatchObject({ to: "Coffee Isle", ids: ["t1", "t2"] });
  });
});
