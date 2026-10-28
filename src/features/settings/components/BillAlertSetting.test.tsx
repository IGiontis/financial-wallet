import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import BillAlertSetting from "./BillAlertSetting";

// The popup's settings: nothing is written until «Save», and «Save» first says what changes.

const settings = vi.hoisted(() => ({ values: {} as Record<string, unknown>, writes: [] as [string, unknown][] }));
vi.mock("../../../shared/hooks/useWorkspaceSetting", () => ({
  useWorkspaceSetting: (key: string, initial: unknown) => [key in settings.values ? settings.values[key] : initial, (value: unknown) => settings.writes.push([key, value])],
}));
vi.mock("../../bills/useBills", () => ({
  useBills: () => ({
    data: [
      { id: "power", name: "ΔΕΗ", isActive: true },
      { id: "water", name: "Νερό", isActive: true },
    ],
  }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn() } }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  settings.values = {};
  settings.writes = [];
});

const renderSetting = () =>
  render(
    <MemoryRouter>
      <BillAlertSetting />
    </MemoryRouter>,
  );

describe("the bills popup's settings", () => {
  it("starts on one reach for all, with nothing saved", () => {
    renderSetting();
    expect(screen.getByRole("button", { name: "Same for all" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Per bill" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "How early, for all" })).toHaveValue("5d");
  });

  it("writes nothing as it is changed, and Save and Revert wait for a change", async () => {
    renderSetting();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revert" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "How early, for all" }), "1m");
    expect(settings.writes).toEqual([]);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("lists what changes before saving, and saves only on yes", async () => {
    renderSetting();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "How early, for all" }), "1m");
    await userEvent.click(screen.getByRole("checkbox", { name: "Νερό" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const list = within(screen.getByRole("dialog")).getByRole("list", { name: "Save these changes?" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Same for all5 days before → 1 month before", "Νερόshown → not shown"]);
    expect(settings.writes).toEqual([]);

    await userEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Save" }).at(-1)!);
    expect(settings.writes).toEqual([
      ["bill-alerts-reach", "1m"],
      ["bill-alerts-off", ["water"]],
    ]);
  });

  it("puts every change back with Revert", async () => {
    renderSetting();
    await userEvent.click(screen.getByRole("checkbox", { name: "ΔΕΗ" }));
    expect(screen.getByRole("checkbox", { name: "ΔΕΗ" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByRole("checkbox", { name: "ΔΕΗ" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(settings.writes).toEqual([]);
  });

  it("into per bill from one for all, every bill starts at the one for all — not at what it was once set to", async () => {
    settings.values = { "bill-alerts-scope": "all", "bill-alerts-reach": "3d", "bill-alerts-by-bill": { power: "6m" } };
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Per bill" }));
    expect(screen.getByLabelText("How early: ΔΕΗ")).toHaveValue("3d");
    expect(screen.getByLabelText("How early: Νερό")).toHaveValue("3d");
    // The tab alone moves no bill: nothing to save, nothing to revert.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revert" })).toBeDisabled();
  });

  it("from per bill back to one for all counts when a bill had its own reach", async () => {
    settings.values = { "bill-alerts-scope": "bill", "bill-alerts-reach": "5d", "bill-alerts-by-bill": { power: "1m" } };
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Same for all" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(within(screen.getByRole("dialog")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["How early to show themPer bill → Same for all"]);
  });

  it("saved per bill already, back and forth finds each bill's own again", async () => {
    settings.values = { "bill-alerts-scope": "bill", "bill-alerts-reach": "3d", "bill-alerts-by-bill": { power: "6m" } };
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Same for all" }));
    await userEvent.click(screen.getByRole("button", { name: "Per bill" }));
    expect(screen.getByLabelText("How early: ΔΕΗ")).toHaveValue("6m");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("per bill: each its own reach, starting from the one for all, said by name in the confirmation", async () => {
    settings.values = { "bill-alerts-reach": "3d" };
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Per bill" }));
    expect(screen.getByLabelText("How early: ΔΕΗ")).toHaveValue("3d");
    await userEvent.selectOptions(screen.getByLabelText("How early: ΔΕΗ"), "2m");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const items = within(screen.getByRole("dialog")).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["How early to show themSame for all → Per bill", "ΔΕΗ3 days before → 2 months before"]);
  });
});
