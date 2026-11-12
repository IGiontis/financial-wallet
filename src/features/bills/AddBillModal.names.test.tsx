import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddBillModal from "./AddBillModal";
import { billKeys } from "./billCache";
import { currentStep, next, tile } from "./billWizardTest";
import type { Bill, Category } from "../../shared/types/IndexTypes";

// The bill's name against the bills the page already holds (`matchName`): the
// same name blocks Next — two «ΔΕΗ» rows read as one bill paid twice — a
// similar one is only pointed out. Read from the cache: nothing is fetched.

vi.mock("../../firebase/firestore", () => ({ getUser: vi.fn(() => Promise.resolve(null)) }));
vi.mock("../../firebase/exchangeRate", () => ({
  fetchExchangeRates: vi.fn(() => new Promise(() => {})),
  convertAmount: (n: number) => n,
  readStoredRates: () => undefined,
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }) }));

const categories = [{ id: "c1", name: "Electricity", type: "expense", icon: "⚡", userId: "u1" }] as unknown as Category[];
const deh = { id: "b1", userId: "u1", name: "ΔΕΗ σπίτι", amount: 60, categoryId: "c1", frequency: "monthly", dueDay: 5, isActive: true } as unknown as Bill;

function open(bill: Bill | null = null) {
  const client = new QueryClient();
  // As the Bills page leaves it: signed-out tests read the key of "".
  client.setQueryData(billKeys.all(""), [deh]);
  render(
    <QueryClientProvider client={client}>
      <AddBillModal isOpen onClose={() => {}} categories={categories} bill={bill} onSubmit={async () => {}} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
  await i18n.changeLanguage("en");
});

describe("a bill's name", () => {
  it("is refused when another bill has it — said once the field is left, not while typing", async () => {
    open();
    await userEvent.type(await screen.findByLabelText(/^name/i), " δεη  ΣΠΙΤΙ ");
    // Typing: not yet. Leaving the field or pressing Next: said.
    expect(screen.queryByTestId("name-exists")).toBeNull();
    await userEvent.click(await tile(/is it active/i, true));
    await next();
    expect(currentStep()).toMatch(/^1/);
    expect(screen.getByTestId("name-exists")).toHaveTextContent("Already exists: ΔΕΗ σπίτι");
  });

  it("a similar one is only suggested: Next goes on", async () => {
    open();
    await userEvent.type(await screen.findByLabelText(/^name/i), "DEH spiti");
    await userEvent.click(await tile(/is it active/i, true));
    expect(screen.getByTestId("name-similar")).toHaveTextContent("Did you mean “ΔΕΗ σπίτι”?");
    await next();
    expect(currentStep()).toMatch(/^2/);
  });

  it("an edit keeps its own name", async () => {
    open(deh);
    await next();
    expect(screen.queryByTestId("name-exists")).toBeNull();
    expect(currentStep()).toMatch(/^2/);
  });
});
