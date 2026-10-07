import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { DeleteButton } from "./DeleteButton";

// Nothing in the app is deleted on one tap: the button asks first, unless the
// click opens a confirmation of the page's own.

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the delete button", () => {
  it("asks first, naming what goes, and deletes only on the question's own button", async () => {
    const onClick = vi.fn();
    render(<DeleteButton onClick={onClick} what="Food" />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onClick).not.toHaveBeenCalled();
    const question = screen.getByText("Delete?").closest(".modal-content") as HTMLElement;
    expect(question).toHaveTextContent("“Food” will be deleted for good.");

    await userEvent.click(within(question).getByRole("button", { name: "Delete" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("deletes nothing when the question is cancelled", async () => {
    const onClick = vi.fn();
    render(<DeleteButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("hands straight on when the page asks for itself", async () => {
    const onClick = vi.fn();
    render(<DeleteButton opensConfirm onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("Delete?")).toBeNull();
  });
});
