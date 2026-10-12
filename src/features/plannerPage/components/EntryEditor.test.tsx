import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import EntryEditor, { type EntryDraft } from "./EntryEditor";

// The figure wizard: what it is, when it applies, then the check, with Save
// only on the check. What matters is that the stored figure is exactly what
// the check said, and that a season switched off does not linger.

const fmt = (n: number) => `€${n.toFixed(2)}`;
const onSave = vi.fn();
const onDelete = vi.fn();

const setup = (mode: "line" | "oneoff", draft: EntryDraft, withDelete = false) => {
  onSave.mockReset();
  onDelete.mockReset();
  return render(<EntryEditor mode={mode} draft={draft} formatCurrency={fmt} onSave={onSave} onClose={() => {}} onDelete={withDelete ? onDelete : undefined} />);
};
const next = () => userEvent.click(screen.getByRole("button", { name: /Next/ }));
const review = () => screen.getByRole("dialog");

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("a monthly figure", () => {
  it("has no Save before the check, the third step", async () => {
    setup("line", { label: "Food", amount: "300" });

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("will not leave the first step without an amount", async () => {
    setup("line", { label: "Food", amount: "" });

    await next();

    expect(screen.getByLabelText("Amount per month")).toBeInvalid();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("says all year, and saves with no season at all", async () => {
    setup("line", { label: "Food", amount: "300" });
    await next();
    await next();

    expect(within(review()).getByText("All year")).toBeInTheDocument();
    expect(within(review()).getByText("€300.00 a month")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({ label: "Food", amount: "300" });
  });

  it("reads a season back as a sentence, and keeps it", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-04", yearly: true }, true);
    await next();
    await next();

    expect(within(review()).getByText(/Dec 2026 — Apr 2027 · every year/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "ski", amount: "200", from: "2026-12", to: "2027-04", yearly: true });
  });

  it("drops the whole season once it is switched back to all year", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-04", yearly: true, until: "2030-04" }, true);
    await next();
    await userEvent.click(screen.getByRole("button", { name: "All year" }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toEqual({ id: "ski", label: "Skiing", amount: "200" });
    expect(saved).not.toHaveProperty("from");
    expect(saved).not.toHaveProperty("yearly");
    expect(saved).not.toHaveProperty("until");
  });

  it("refuses a season that ends before it starts, at the step that asked it", async () => {
    setup("line", { label: "Skiing", amount: "200", from: "2026-12", to: "2026-04" });
    await next();

    expect(screen.getByText("The last month is before the first.")).toBeInTheDocument();
    await next();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("keeps the bin to the left, and only for a figure that exists", () => {
    setup("line", { id: "a", label: "Food", amount: "300" }, true);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("a figure on a date", () => {
  const draft: EntryDraft = { label: "Bonus", amount: "1400", date: "2026-12-20" };

  it("is once unless it is told to repeat, and saves no repeat", async () => {
    setup("oneoff", draft);
    await next();
    await next();

    expect(within(review()).getByText("€1400.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ label: "Bonus", amount: "1400", date: "2026-12-20" });
    expect(saved.every).toBeUndefined();
  });

  it("repeating asks for a cadence, and says it in the check", async () => {
    setup("oneoff", draft);
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Repeats" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "3");
    await next();

    expect(within(review()).getByText(/Every 3 months · First one/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ every: 3, date: "2026-12-20" });
  });

  it("turning the repeat back off takes the cadence and its end with it", async () => {
    setup("oneoff", { ...draft, every: 3, until: "2027-12-20" });
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Once" }));
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.every).toBeUndefined();
    expect(saved.until).toBeUndefined();
  });
});
