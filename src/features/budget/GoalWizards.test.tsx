import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AddNewGoalModal from "./AddNewGoalModal";
import EditGoalModal from "./EditGoalModal";
import type { InvestmentGoalWithStats } from "../../shared/types/IndexTypes";
import { expectNoErrors, shownErrors } from "../../test/noEarlyErrors";

// The goal and investment forms as wizards: «What» → «Target» → «Look» →
// «Review», Save only on the review, rows jumping back. What they save must be
// exactly what the one-page forms saved — written out by hand here, field by
// field, not worked out by the code under test.

vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, baseCurrency: "EUR" }) }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent;
const nameInput = () => document.querySelector<HTMLInputElement>('input[name="name"]')!;

// «Start it active?» starts unanswered on a new goal (no prefill, tiles included).
const answerActive = () => userEvent.click(screen.getByRole("radio", { name: /^Active/ }));

describe("a new goal (Goals page)", () => {
  it("walks what → target → look → review, with Save only on the review", async () => {
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="targeted" />);
    expect(current()).toMatch(/What/);
    await next();
    expect(current()).toMatch(/What/); // no name, no going on
    await userEvent.type(nameInput(), "Trip");
    await next();
    expect(current()).toMatch(/Target/);
    await next();
    expect(current()).toMatch(/Target/); // no amount
    await userEvent.type(screen.getByLabelText(/Target amount/), "700");
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
    await next();
    expect(current()).toMatch(/Look/);
    await answerActive();
    await next();
    expect(current()).toMatch(/Review/);
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
    // A row jumps back to its step.
    await userEvent.click(screen.getByRole("button", { name: /^Target\s*€700\.00/ }));
    expect(current()).toMatch(/Target/);
  });

  it("saves the same goal the one-page form saved", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="targeted" />);
    await userEvent.type(nameInput(), "Trip");
    await next();
    await userEvent.type(screen.getByLabelText(/Target amount/), "700");
    await next();
    await userEvent.click(screen.getByRole("button", { name: "✈️" }));
    await userEvent.type(screen.getByLabelText("Notes"), "Sifnos");
    // «Start it active?» — answered «Paused».
    await userEvent.click(screen.getByRole("radio", { name: "Paused" }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));

    const [dto, isActive] = onSubmit.mock.calls[0];
    expect(isActive).toBe(false);
    expect(dto.deadline).toBeInstanceOf(Date);
    expect(dto).toEqual({
      name: "Trip",
      icon: "✈️",
      color: "#3B82F6",
      notes: "Sifnos",
      goalType: "targeted",
      targetAmount: 700,
      targetPeriod: "custom",
      deadline: dto.deadline,
      planFrom: undefined,
      parts: undefined,
    });
  });
});

describe("the new-goal modal, which stays mounted between uses", () => {
  it("starts the next goal without the previous goal's parts", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="targeted" />);
    await userEvent.type(nameInput(), "Ski");
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    await userEvent.type(screen.getByLabelText("Part 1: what for"), "House");
    await userEvent.type(screen.getByLabelText("Part 1: to"), "200");
    await next();
    await answerActive();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit.mock.calls[0][0].parts).toHaveLength(1);

    // Same modal, next goal: one amount, no parts left over.
    expect(current()).toMatch(/What/);
    await userEvent.type(nameInput(), "Car");
    await next();
    expect(screen.queryByLabelText("Part 1: what for")).toBeNull();
    await userEvent.type(screen.getByLabelText(/Target amount/), "900");
    await next();
    await answerActive();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ name: "Car", targetAmount: 900, parts: undefined });
  });

  it("closing it drops the parts too", async () => {
    const { rerender } = render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="targeted" />);
    await userEvent.type(nameInput(), "Ski");
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    await userEvent.click(document.querySelector<HTMLButtonElement>(".modal .btn-close")!);
    rerender(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="targeted" />);
    await userEvent.type(nameInput(), "Car");
    await next();
    expect(screen.queryByLabelText("Part 1: what for")).toBeNull();
  });
});

describe("a new investment (Investments page)", () => {
  it("a tracked one has no target step, and saves no target", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="recurring" />);
    await userEvent.type(nameInput(), "ETF");
    await userEvent.click(screen.getByRole("radio", { name: /Tracking/ }));
    expect(screen.queryByRole("button", { name: /Target/ })).toBeNull();
    await next();
    expect(current()).toMatch(/Look/);
    await answerActive();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit.mock.calls[0]).toEqual([
      { name: "ETF", icon: undefined, color: "#3B82F6", notes: undefined, goalType: "open_ended", targetAmount: undefined, targetPeriod: undefined, deadline: undefined, planFrom: undefined, parts: undefined },
      true,
    ]);
  });

  it("a repeating one saves its amount and period", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="recurring" />);
    await userEvent.type(nameInput(), "Savings");
    await next();
    await userEvent.type(screen.getByLabelText(/Target amount/), "150");
    await userEvent.selectOptions(screen.getByLabelText(/Period/), "yearly");
    await next();
    await answerActive();
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: "Savings",
      icon: undefined,
      color: "#3B82F6",
      notes: undefined,
      goalType: "targeted",
      targetAmount: 150,
      targetPeriod: "yearly",
      deadline: undefined,
      planFrom: undefined,
      parts: undefined,
    });
  });
});

describe("editing a goal", () => {
  const day = new Date(2026, 0, 1);
  const goal = {
    id: "g1",
    userId: "u",
    name: "Trip",
    icon: "✈️",
    color: "#10B981",
    notes: "Sifnos",
    goalType: "targeted",
    targetAmount: 700,
    targetPeriod: "custom",
    deadline: new Date(Date.UTC(2027, 5, 1)),
    planFrom: "2026-12-01",
    isActive: true,
    isCompleted: false,
    totalSaved: 0,
    createdAt: day,
    updatedAt: day,
  } as unknown as InvestmentGoalWithStats;

  it("nothing changed: the review's Save stays off and nothing is written", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EditGoalModal goal={goal} isOpen onClose={() => {}} onSubmit={onSubmit} />);
    // Every step answered: the rail jumps straight to the review.
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(current()).toMatch(/Review/);
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("switching to parts alone counts as a change", async () => {
    render(<EditGoalModal goal={goal} isOpen onClose={() => {}} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Target/ }));
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    // Written as one part of 700: the target figure is the same, the goal is not.
    await userEvent.type(screen.getByLabelText("Part 1: what for"), "Hotel");
    await userEvent.type(screen.getByLabelText("Part 1: to"), "700");
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeEnabled();
  });

  it("a corrected note writes back every other field as it was saved", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EditGoalModal goal={goal} isOpen onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /Look/ }));
    await userEvent.clear(screen.getByLabelText("Notes"));
    await userEvent.type(screen.getByLabelText("Notes"), "Sifnos, July");
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    const [id, data] = onSubmit.mock.calls[0];
    expect(id).toBe("g1");
    expect(data).toEqual({
      name: "Trip",
      icon: "✈️",
      color: "#10B981",
      notes: "Sifnos, July",
      targetAmount: 700,
      targetPeriod: "custom",
      deadline: new Date("2027-06-01"),
      planFrom: "2026-12-01",
      parts: undefined,
    });
  });

  it("puts the bin far left, then Back / Cancel, and hands delete to the page", async () => {
    const onDelete = vi.fn();
    render(<EditGoalModal goal={goal} isOpen onClose={() => {}} onSubmit={vi.fn()} onDelete={onDelete} />);
    const footer = document.querySelector(".modal-footer") as HTMLElement;
    const left = footer.firstElementChild as HTMLElement;
    const [bin, cancel] = within(left).getAllByRole("button");
    expect(bin).toHaveAccessibleName("Delete");
    expect(cancel).toHaveTextContent("Cancel");
    await userEvent.click(bin);
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

// ── Item 97b: no error before anything was touched ───────────────────────────
describe("the goal dialogs open without errors", () => {
  it("a new goal: none on opening — not even once the focused name loses its focus empty", async () => {
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="targeted" />);
    const dialog = screen.getByRole("dialog");
    expectNoErrors(dialog);
    // The dialog, a tile or Cancel takes the focus before anything is typed.
    nameInput().focus();
    nameInput().blur();
    await userEvent.click(dialog);
    expectNoErrors(dialog);
    // Next with no name: now it is said.
    await next();
    expect(shownErrors(dialog)).not.toEqual([]);
  });

  it("a new goal: the target step opens clean, the parts editor too", async () => {
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="targeted" />);
    await userEvent.type(nameInput(), "Trip");
    await next();
    expect(current()).toMatch(/Target/);
    expectNoErrors(screen.getByRole("dialog"));
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    expectNoErrors(screen.getByRole("dialog"));
    await next();
    await next();
    expect(current()).toMatch(/Target/);
  });

  it("a new investment: none on opening, none after picking its kind", async () => {
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType="recurring" />);
    const dialog = screen.getByRole("dialog");
    expectNoErrors(dialog);
    await userEvent.click(within(dialog).getAllByRole("radio")[1]);
    expectNoErrors(dialog);
  });

  it("editing: none on opening, none on any step walked without a change", async () => {
    const goal = {
      id: "g2",
      userId: "u",
      name: "Trip",
      icon: "✈️",
      color: "#10B981",
      goalType: "targeted",
      targetAmount: 700,
      targetPeriod: "custom",
      deadline: new Date(Date.UTC(2027, 5, 1)),
      isActive: true,
      isCompleted: false,
      totalSaved: 0,
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    } as unknown as InvestmentGoalWithStats;
    render(<EditGoalModal goal={goal} isOpen onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expectNoErrors(dialog);
    await next();
    expectNoErrors(dialog);
    await next();
    expectNoErrors(dialog);
  });
});

describe("«Start it active?» on a new goal", () => {
  it("starts with neither tile chosen and no error; Next asks for an answer; «Paused» is saved as paused", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddNewGoalModal isOpen onClose={() => {}} onSubmit={onSubmit} defaultGoalType="recurring" />);
    await userEvent.type(nameInput(), "ETF");
    await userEvent.click(screen.getByRole("radio", { name: /Tracking/ }));
    await next();
    expect(current()).toMatch(/Look/);
    expect(screen.getByRole("radio", { name: /^Active/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /^Paused/ })).toHaveAttribute("aria-checked", "false");
    expectNoErrors(screen.getByRole("dialog"));
    await next();
    expect(current()).toMatch(/Look/);
    expect(screen.getByText("Pick Yes or No")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /^Paused/ }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onSubmit.mock.calls[0][1]).toBe(false);
  });
});
