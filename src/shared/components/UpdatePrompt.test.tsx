import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { UpdatePrompt } from "./UpdatePrompt";

// The new-version prompt: centred, blocking, one button.
//
// Blocking is the part that needs pinning down. A reload throws away whatever
// was typed into an open form, so the prompt must never appear over one — it
// waits, and turns up once the form is closed.

const update = vi.hoisted(() => ({ needRefresh: false, apply: vi.fn() }));
vi.mock("../hooks/useAppUpdate", () => ({ useAppUpdate: () => update }));

/** Stands in for an open reactstrap dialog, e.g. the expense form. */
const openForm = () => {
  const form = document.createElement("div");
  form.className = "modal show";
  document.body.appendChild(form);
  return form;
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  update.needRefresh = false;
  update.apply.mockReset();
});

afterEach(() => {
  document.querySelectorAll(".modal.show").forEach((node) => node.remove());
});

describe("UpdatePrompt", () => {
  it("shows nothing while there is no new version", () => {
    render(<UpdatePrompt />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks, in the middle of the screen, when there is one", async () => {
    update.needRefresh = true;
    render(<UpdatePrompt />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("New version");
    expect(document.querySelector(".modal-dialog-centered")).not.toBeNull();
  });

  it("stays open once it has faded in", async () => {
    // Its own dialog is an open dialog too. Counted as someone's form, it would
    // close itself the moment it finished appearing, and then open again.
    update.needRefresh = true;
    render(<UpdatePrompt />);

    await waitFor(() => expect(document.querySelector(".update-prompt.show")).not.toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(document.querySelector(".update-prompt.show")).not.toBeNull();
    expect(screen.getByText("New version")).toBeInTheDocument();
  });

  it("offers no way out but Refresh", async () => {
    update.needRefresh = true;
    render(<UpdatePrompt />);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Refresh"]);
  });

  it("refreshes once, however often it is tapped", async () => {
    update.needRefresh = true;
    render(<UpdatePrompt />);

    const button = await screen.findByRole("button", { name: "Refresh" });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(update.apply).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("waits while a form is open, and appears once it closes", async () => {
    // Someone halfway through typing an expense when the new version lands.
    const form = openForm();
    update.needRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.queryByText("New version")).not.toBeInTheDocument();

    await act(async () => {
      form.remove();
    });

    expect(await screen.findByText("New version")).toBeInTheDocument();
  });
});
