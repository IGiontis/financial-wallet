import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddButton, AddHeader } from "./AddButton";

describe("the one «+»", () => {
  it("is a bare plus whose words are its name and tooltip, and never shrinks or wraps", async () => {
    const onClick = vi.fn();
    render(<AddButton label="New bill" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "New bill" });
    expect(button).toHaveAttribute("title", "New bill");
    expect(button.textContent).toBe("");
    expect(button.className).toMatch(/flex-shrink-0/);
    expect(button.className).toMatch(/text-nowrap/);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("sits first in a header, the title after it", () => {
    render(<AddHeader label="New goal" onAdd={() => {}} title="Goals" subtitle="Saving up" />);
    const button = screen.getByRole("button", { name: "New goal" });
    const heading = screen.getByRole("heading", { name: "Goals" });
    expect(button.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
