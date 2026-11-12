import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddNewGoalModal from "./AddNewGoalModal";
import { investmentKeys } from "./useInvestments";
import { markedLabels } from "../../test/requiredMarks";

// A new goal's or investment's name against those the page already holds
// (`matchName`, from the cache — nothing fetched): the same name blocks Next,
// a Greeklish or one-typo twin is only pointed out.

vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, baseCurrency: "EUR" }) }));

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent ?? "";
const nameField = () => document.querySelector<HTMLInputElement>('input[name="name"]')!;

function open(defaultGoalType: "targeted" | "recurring") {
  const client = new QueryClient();
  client.setQueryData(investmentKeys.goals(""), [{ id: "g1", name: "Ταξίδι στη Σίφνο" }, { id: "g2", name: "Παγκόσμιο ETF" }]);
  render(
    <QueryClientProvider client={client}>
      <AddNewGoalModal isOpen onClose={() => {}} onSubmit={vi.fn()} defaultGoalType={defaultGoalType} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("a goal's name", () => {
  it("is refused when another goal has it — after Next, not while typing", async () => {
    open("targeted");
    await userEvent.type(nameField(), "ταξιδι στη  ΣΙΦΝΟ");
    expect(screen.queryByTestId("name-exists")).toBeNull();
    await next();
    expect(current()).toMatch(/^1/);
    expect(screen.getByTestId("name-exists")).toHaveTextContent("Already exists: Ταξίδι στη Σίφνο");
  });

  it("a Greeklish twin is only suggested: Next goes on", async () => {
    open("targeted");
    await userEvent.type(nameField(), "Taxidi sti Sifno");
    expect(screen.getByTestId("name-similar")).toHaveTextContent("Did you mean “Ταξίδι στη Σίφνο”?");
    await next();
    expect(current()).toMatch(/^2/);
  });
});

describe("an investment's name", () => {
  it("is refused the same way", async () => {
    open("recurring");
    await userEvent.type(nameField(), "παγκοσμιο etf");
    await next();
    expect(current()).toMatch(/^1/);
    expect(screen.getByTestId("name-exists")).toHaveTextContent("Already exists: Παγκόσμιο ETF");
  });
});

describe("the goal wizard's required fields", () => {
  it("a goal: its name, then its target and deadline — or its parts' «what for» and «to»", async () => {
    open("targeted");
    const dialog = screen.getByRole("dialog");
    expect(markedLabels(dialog)).toEqual(["Goal name"]);
    expect(nameField()).toHaveAttribute("aria-required", "true");
    await userEvent.type(nameField(), "Ski");
    await next();
    // «Plan from» is optional, and says so.
    expect(markedLabels(dialog)).toEqual(["Target amount", "Deadline"]);
    expect(screen.getByLabelText(/^Target amount/)).toHaveAttribute("aria-required", "true");
    await userEvent.click(screen.getByRole("button", { name: "Parts" }));
    expect(markedLabels(dialog)).toEqual(["What for", "To", "Deadline"]);
    expect(screen.getByLabelText("Part 1: what for")).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Part 1: from")).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText("Part 1: to")).toHaveAttribute("aria-required", "true");
  });

  it("an investment: name and type, amount and period, then «start it active?» — icon, colour and notes stay optional", async () => {
    open("recurring");
    const dialog = screen.getByRole("dialog");
    expect(markedLabels(dialog)).toEqual(["Investment name", "Type"]);
    expect(screen.getByRole("radiogroup", { name: /^Type/ })).toHaveAttribute("aria-required", "true");
    await userEvent.type(nameField(), "Monthly ETF");
    await next();
    expect(markedLabels(dialog)).toEqual(["Target amount", "Period"]);
    await userEvent.type(screen.getByLabelText(/^Target amount/), "100");
    await next();
    expect(markedLabels(dialog)).toEqual(["Start it active?"]);
  });
});

