import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import IncomeFormModal from "./IncomeFormModal";
import { draftToIncome, emptyDraft } from "../incomeForm";
import { makeFormats } from "../incomeText";
import { markedLabels } from "../../../test/requiredMarks";

// An income's name against the incomes the page already holds on the user
// document (`matchName`, nothing read): the same name blocks Next, a similar
// one is only pointed out, and an edit keeps its own name.

const held = vi.hoisted(() => ({ incomes: [] as unknown[] }));
vi.mock("../../../shared/hooks/useCachedList", () => ({ useCachedWorkspaceList: () => held.incomes }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n}`, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../../categories/CategoryPicker", () => ({ default: () => <p>category picker</p>, CategoryPicker: () => <p>category picker</p> }));

const now = new Date(2026, 10, 12);
const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent ?? "";

function open(draft = emptyDraft(now, { categoryId: "c1" })) {
  render(<IncomeFormModal draft={draft} isEdit={!!draft.id} categories={[]} accounts={[]} f={makeFormats("en")} now={now} onSave={() => {}} onClose={() => {}} />);
}

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
  // A real stored income, made the way the form makes one.
  const stored = draftToIncome({ ...emptyDraft(now, { categoryId: "c1", name: "Ενοίκιο γκαρσονιέρας", amount: "400", variable: false, day: "1", hasPause: false, isSalary: false, accountId: "a1" }), id: "i1" }, (n) => n);
  expect(stored).toBeDefined();
  held.incomes = [stored];
});

describe("an income's name", () => {
  it("is refused when another income has it — after Next, not while typing", async () => {
    open();
    await userEvent.type(screen.getByLabelText(/^Name/), "ενοικιο  γκαρσονιερας");
    expect(screen.queryByTestId("name-exists")).toBeNull();
    await next();
    expect(current()).toMatch(/^1/);
    expect(screen.getByTestId("name-exists")).toHaveTextContent("Already exists: Ενοίκιο γκαρσονιέρας");
  });

  it("a similar one is only suggested: Next goes on", async () => {
    open();
    await userEvent.type(screen.getByLabelText(/^Name/), "Enoikio garsonieras");
    expect(screen.getByTestId("name-similar")).toBeInTheDocument();
    await next();
    expect(current()).toMatch(/^2/);
  });

  it("an edit keeps its own name", async () => {
    open({ ...emptyDraft(now, { categoryId: "c1" }), id: "i1", name: "Ενοίκιο γκαρσονιέρας" });
    await next();
    expect(screen.queryByTestId("name-exists")).toBeNull();
    expect(current()).toMatch(/^2/);
  });
});

describe("the income wizard's required fields", () => {
  it("carry the star, step by step — what its checks require and nothing else", async () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(markedLabels(dialog)).toEqual(["Category", "Name"]);
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-required", "true");
    await userEvent.type(screen.getByLabelText(/^Name/), "Tutoring");
    await next();

    expect(markedLabels(dialog)).toEqual(["Amount (EUR)", "Does the amount change every time?"]);
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute("aria-required", "true");
    await userEvent.type(screen.getByLabelText(/^Amount/), "150");
    await userEvent.click(screen.getByRole("radio", { name: /^No/ }));
    await next();

    // Monthly by default: how often, the day and the first time; no weekday, no month.
    expect(markedLabels(dialog)).toEqual(["Every", "Day of the month", "First time"]);
    await userEvent.click(screen.getByRole("button", { name: /day of the month/i }));
    await userEvent.click(screen.getByRole("option", { name: "Day 1 of the month" }));
    await next();

    // The account is optional («no account» is an answer); the end is a choice that always has one.
    expect(markedLabels(dialog)).toEqual(["Does it take a break some months?", "Is it your salary?"]);
    const [pause] = screen.getAllByRole("radiogroup").filter((g) => g.getAttribute("aria-required") === "true");
    await userEvent.click(within(pause).getByRole("radio", { name: /^Yes/ }));
    // A break needs its first month; its last only when it comes back every year.
    expect(markedLabels(dialog)).toEqual(["Does it take a break some months?", "From", "Is it your salary?"]);
    await userEvent.click(screen.getByLabelText(/every year/i));
    expect(markedLabels(dialog)).toEqual(["Does it take a break some months?", "From", "Until", "Is it your salary?"]);
  });
});

