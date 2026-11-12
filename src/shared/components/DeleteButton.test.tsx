import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

  // «An action waits for its answer» (.claude/rules/ui.md): the owner's
  // second press on a delete that was still running.
  describe("while the delete runs", () => {
    const pending = () => {
      let settle!: { resolve: () => void; reject: (e: unknown) => void };
      const onClick = vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
          }),
      );
      return { onClick, settle: () => settle };
    };
    const ask = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      return screen.getByText("Delete?").closest(".modal-content") as HTMLElement;
    };

    it("runs once however fast it is pressed, says it is working, and locks the question", async () => {
      const { onClick, settle } = pending();
      render(<DeleteButton onClick={onClick} />);
      const question = await ask();
      const confirm = within(question).getByRole("button", { name: "Delete" });
      // Two presses in the same moment — before React has drawn anything.
      act(() => {
        fireEvent.click(confirm);
        fireEvent.click(confirm);
      });
      expect(onClick).toHaveBeenCalledOnce();
      expect(within(question).getByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(within(question).getByRole("button", { name: "Cancel" })).toBeDisabled();
      // No closing it half-way: Esc does nothing.
      fireEvent.keyDown(question, { key: "Escape", keyCode: 27 });
      expect(screen.getByText("Delete?")).toBeInTheDocument();

      await act(async () => settle().resolve());
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("lets the question go once the answer is in — a failure too (the handler said so)", async () => {
      const { onClick, settle } = pending();
      render(<DeleteButton onClick={onClick} />);
      const question = await ask();
      await userEvent.click(within(question).getByRole("button", { name: "Delete" }));
      await act(async () => settle().reject(new Error("permission-denied")));
      await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Deleting..." })).toBeNull());
      // Free again: it can be asked once more (the page's button comes first; the question may still be fading).
      expect(screen.getAllByRole("button", { name: "Delete" })[0]).toBeEnabled();
    });

    it("a button that opens the page's own question is locked while what it started runs", async () => {
      const { onClick, settle } = pending();
      render(<DeleteButton opensConfirm onClick={onClick} />);
      const button = screen.getByRole("button", { name: "Delete" });
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      expect(onClick).toHaveBeenCalledOnce();
      expect(button).toBeDisabled();
      await act(async () => settle().resolve());
      expect(button).toBeEnabled();
    });
  });
});
