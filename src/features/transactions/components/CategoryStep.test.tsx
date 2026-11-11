import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import CategoryPicker from "../../categories/CategoryPicker";
import type { Category } from "../../../shared/types/IndexTypes";

// The owner's rule for the transaction wizards: a category is not made halfway
// through writing down money. The category step offers only a small way to
// where categories are managed.

const cats = [{ id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null }] as unknown as Category[];

beforeAll(async () => {
  await i18n.changeLanguage("el");
});

describe("the category step of a transaction wizard", () => {
  it("links to managing categories and offers no «new category»", () => {
    render(
      <MemoryRouter>
        <CategoryPicker categories={cats} value="" type="expense" onChange={() => {}} manage="link" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Διαχείριση κατηγοριών" });
    expect(link).toHaveAttribute("href", "/settings/data");
    expect(screen.queryByRole("button", { name: /νέα|new/i })).not.toBeInTheDocument();
    // The categories themselves are still there to pick.
    expect(screen.getByRole("option", { name: /Groceries|Σούπερ|Τρόφιμα/ })).toBeInTheDocument();
  });
});
