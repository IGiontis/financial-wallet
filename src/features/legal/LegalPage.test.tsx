import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import LegalPage from "./LegalPage";
import { LegalLinks } from "./LegalLinks";
import { legalText } from "./legalContent";

// The two legal pages, in both languages: the same sections in each, so a
// change made to one language and forgotten in the other shows up here.

const renderPage = (doc: "terms" | "privacy") =>
  render(
    <MemoryRouter>
      <LegalPage doc={doc} />
    </MemoryRouter>,
  );

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe.each(["terms", "privacy"] as const)("the %s page", (doc) => {
  it("has as many sections in Greek as in English", () => {
    expect(legalText(doc, "el").sections).toHaveLength(legalText(doc, "en").sections.length);
  });

  it("reads in the app's language", async () => {
    await i18n.changeLanguage("el");
    renderPage(doc);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(legalText(doc, "el").title);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(legalText(doc, "el").sections.length);
    expect(screen.getByText(/Τελευταία ενημέρωση/)).toBeInTheDocument();

    await i18n.changeLanguage("en");
    renderPage(doc);
    expect(screen.getAllByRole("heading", { level: 1 }).at(-1)).toHaveTextContent(legalText(doc, "en").title);
  });
});

describe("the links to them", () => {
  it("lead to both pages, with the promise where there is room for it", () => {
    render(
      <MemoryRouter>
        <LegalLinks />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByText(/No tracking or advertising cookies/)).toBeInTheDocument();
  });

  it("drop the promise when asked, on the sign-in pages", () => {
    const { container } = render(
      <MemoryRouter>
        <LegalLinks promise={false} />
      </MemoryRouter>,
    );
    expect(within(container).queryByText(/cookies/)).toBeNull();
  });
});
