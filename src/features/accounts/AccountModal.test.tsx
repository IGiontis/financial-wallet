import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AccountModal from "./AccountModal";
import type { MoneyAccount } from "./accountsUtils";
import { markedLabels } from "../../test/requiredMarks";

// The account form as a short wizard: «What» → «Details» → «Review». What it
// saves must be the draft the one-page form saved — written out here by hand.

vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, baseCurrency: "EUR" }) }));
// The accounts already held, as the name check reads them (no read of its own).
const held = vi.hoisted(() => ({ accounts: [] as unknown[] }));
vi.mock("../../shared/hooks/useCachedList", () => ({ useCachedWorkspaceList: () => held.accounts }));
vi.mock("../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent;

describe("adding an account", () => {
  it("walks what → details → review, holding at each until it is filled in", async () => {
    const onSave = vi.fn();
    render(<AccountModal isMain={false} baseCurrency="EUR" onSave={onSave} onClose={() => {}} />);
    await next();
    expect(current()).toMatch(/What/);
    await userEvent.type(screen.getByLabelText("Name"), "  Revolut ");
    await next();
    expect(current()).toMatch(/Details/);
    await next();
    expect(current()).toMatch(/Details/); // what it holds is asked
    await userEvent.type(screen.getByLabelText("Holds now"), "1.500,50");
    await userEvent.click(screen.getByRole("button", { name: /purple/i }));
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await next();
    expect(current()).toMatch(/Review/);
    // The review shows the figure that will be saved, not the characters typed.
    expect(screen.getByRole("button", { name: /^Holds nows*€1500.50$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ name: "Revolut", kind: "bank", main: true, amount: 1500.5, color: "purple" });
  });

  it("opens with no error showing, and a later step is not red because an earlier one was tried", async () => {
    render(<AccountModal isMain={false} baseCurrency="EUR" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("Name")).not.toHaveClass("is-invalid");
    await next();
    expect(screen.getByLabelText("Name")).toHaveClass("is-invalid");
    await userEvent.type(screen.getByLabelText("Name"), "Revolut");
    await next();
    expect(current()).toMatch(/Details/);
    // Arrived on «Details» with the amount still empty: not red until Next is pressed here.
    expect(screen.getByLabelText("Holds now")).not.toHaveClass("is-invalid");
    await next();
    expect(screen.getByLabelText("Holds now")).toHaveClass("is-invalid");
  });

  it("cash: no card finish saved", async () => {
    const onSave = vi.fn();
    render(<AccountModal isMain={false} baseCurrency="EUR" onSave={onSave} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Cash/ }));
    await userEvent.type(screen.getByLabelText("Name"), "Wallet");
    await next();
    await userEvent.type(screen.getByLabelText("Holds now"), "0");
    // «Is it the main one?» starts unanswered (no prefill, tiles included): Next asks for it.
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Pick Yes or No")).toBeNull();
    await next();
    expect(current()).toMatch(/Details/);
    expect(screen.getByText("Pick Yes or No")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ name: "Wallet", kind: "cash", main: false, amount: 0, color: undefined });
  });
});

describe("editing an account", () => {
  const account: MoneyAccount = { id: "a1", name: "Eurobank", kind: "bank", main: true, color: "teal" } as MoneyAccount;

  it("jumps to the review and saves the same account back; the main one stays main", async () => {
    const onSave = vi.fn();
    render(<AccountModal account={account} isMain defaultColor="teal" baseCurrency="EUR" onSave={onSave} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByRole("radio", { name: "Yes" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    // Nothing changed: nothing to save.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /What/ }));
    await userEvent.type(screen.getByLabelText("Name"), " Pro");
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ name: "Eurobank Pro", kind: "bank", main: true, amount: undefined, color: "teal" });
  });

  it("No change, no Save: a trailing space is no change, a new finish is, and the old finish back is none again", async () => {
    const onSave = vi.fn();
    render(<AccountModal account={account} isMain defaultColor="teal" baseCurrency="EUR" onSave={onSave} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Name"), " ");
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    await userEvent.click(screen.getByRole("button", { name: /purple/i }));
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByText("Nothing has changed")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    await userEvent.click(screen.getByRole("button", { name: /teal/i }));
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // Enter on the review submits the form: still nothing written.
    await userEvent.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("has the bin far left, then Cancel, and asks before deleting", async () => {
    const onDelete = vi.fn();
    render(<AccountModal account={account} isMain={false} baseCurrency="EUR" onSave={vi.fn()} onDelete={onDelete} onClose={() => {}} />);
    const left = document.querySelector(".modal-footer")!.firstElementChild as HTMLElement;
    const [bin, cancel] = within(left).getAllByRole("button");
    expect(bin).toHaveAccessibleName("Delete account");
    expect(cancel).toHaveTextContent("Cancel");
    await userEvent.click(bin);
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("the name check", () => {
  it("refuses another card's name — after Next, not while typing — and only suggests a similar one", async () => {
    held.accounts = [{ id: "a1", name: "Alpha Bank", kind: "bank" }];
    render(<AccountModal isMain={false} baseCurrency="EUR" onSave={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Name"), " alpha  BANK");
    expect(screen.queryByTestId("name-exists")).toBeNull();
    await next();
    expect(current()).toMatch(/What/);
    expect(screen.getByTestId("name-exists")).toHaveTextContent("Already exists: Alpha Bank");

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Alfa Bank");
    expect(screen.getByTestId("name-similar")).toHaveTextContent("Did you mean “Alpha Bank”?");
    await next();
    expect(current()).toMatch(/Details/);
    held.accounts = [];
  });

  it("an edit keeps its own name", async () => {
    held.accounts = [{ id: "a1", name: "Alpha Bank", kind: "bank" }];
    render(<AccountModal account={{ id: "a1", name: "Alpha Bank", kind: "bank" } as MoneyAccount} isMain baseCurrency="EUR" onSave={() => {}} onClose={() => {}} />);
    await next();
    expect(current()).toMatch(/Details/);
    expect(screen.queryByTestId("name-exists")).toBeNull();
    held.accounts = [];
  });
});

describe("the account form's required fields", () => {
  it("a new one: its name, what it holds and «main?» — the kind and the colour always have an answer", async () => {
    render(<AccountModal isMain={false} baseCurrency="EUR" onSave={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(markedLabels(dialog)).toEqual(["Name"]);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-required", "true");
    await userEvent.type(screen.getByLabelText("Name"), "Revolut");
    await next();
    expect(markedLabels(dialog)).toEqual(["Holds now", "Make it the main account?"]);
    expect(screen.getByLabelText("Holds now")).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-required", "true");
  });

  it("the main one: «main?» is locked on «Yes», so it is not asked of anyone", async () => {
    render(<AccountModal isMain baseCurrency="EUR" onSave={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Name"), "Eurobank");
    await next();
    expect(markedLabels(screen.getByRole("dialog"))).toEqual(["Holds now"]);
  });
});

