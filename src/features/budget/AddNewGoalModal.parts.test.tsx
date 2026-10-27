import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AddNewGoalModal from "./AddNewGoalModal";

// A ski trip written as its parts: saved with them, and with the target their «to» added up.

vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, baseCurrency: "EUR" }) }));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("a new goal from parts", () => {
  it("adds the parts up into the target, and saves them in their order", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="targeted" />);

    await userEvent.type(document.querySelector<HTMLInputElement>('input[name="name"]')!, "Ski");
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    await userEvent.type(screen.getByLabelText("Part 1: what for"), "House");
    await userEvent.type(screen.getByLabelText("Part 1: from"), "150");
    await userEvent.type(screen.getByLabelText("Part 1: to"), "200");
    await userEvent.click(screen.getByRole("button", { name: /Another part/ }));
    await userEvent.type(screen.getByLabelText("Part 2: what for"), "Lift");
    await userEvent.type(screen.getByLabelText("Part 2: from"), "50");
    await userEvent.type(screen.getByLabelText("Part 2: to"), "90");
    // The total under them, as a range.
    expect(screen.getByText("€200.00 – €290.00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));

    const [dto] = onSubmit.mock.calls[0];
    expect(dto.parts.map((p: { label: string; min: number; max: number }) => [p.label, p.min, p.max])).toEqual([
      ["House", 150, 200],
      ["Lift", 50, 90],
    ]);
    // A second way: the target is the «to» of each, added up.
    expect(dto.targetAmount).toBe(200 + 90);
    // Nine fields typed a key at a time: more than the default five seconds.
  }, 20000);

  it("will not go on with a part half written", async () => {
    const onSubmit = vi.fn();
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="targeted" />);
    await userEvent.type(document.querySelector<HTMLInputElement>('input[name="name"]')!, "Ski");
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    await userEvent.type(screen.getByLabelText("Part 1: what for"), "House");
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Needs a name and a «to».")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
