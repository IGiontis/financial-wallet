import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal, ModalBody } from "reactstrap";
import i18n from "../../i18n";
import { DayPicker } from "./DayPicker";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

function Harness({ initial = "", onChange, clearable }: { initial?: number | string; onChange?: (v: string) => void; clearable?: boolean }) {
  const [value, setValue] = useState<number | string>(initial);
  return (
    <DayPicker
      id="day"
      value={value}
      clearable={clearable}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const toggle = () => screen.getByRole("button", { name: /Choose a day|^\d+$/ });

describe("DayPicker", () => {
  it("starts empty, with a placeholder and no error", () => {
    render(<Harness />);
    expect(toggle()).toHaveTextContent("Choose a day");
    expect(toggle()).not.toHaveClass("is-invalid");
  });

  it("opens a grid of 31 days and stores the picked one as the same string a select gave", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(toggle());
    const days = screen.getAllByRole("option");
    expect(days).toHaveLength(31);
    expect(days[30]).toHaveAccessibleName(/31 — or the last day/);
    await userEvent.click(screen.getByRole("option", { name: "Day 15 of the month" }));
    expect(onChange).toHaveBeenCalledWith("15");
    expect(toggle()).toHaveTextContent("15");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the chosen day and moves by day and by week with the arrows", async () => {
    const onChange = vi.fn();
    render(<Harness initial={10} onChange={onChange} />);
    await userEvent.click(toggle());
    expect(screen.getByRole("option", { name: "Day 10 of the month" })).toHaveAttribute("aria-selected", "true");
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Day 10 of the month" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    expect(screen.getByRole("option", { name: "Day 18 of the month" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("option", { name: /^31/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("31");
  });

  it("Escape closes without changing the day", async () => {
    const onChange = vi.fn();
    render(<Harness initial={3} onChange={onChange} />);
    await userEvent.click(toggle());
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Day 3 of the month" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("inside a dialog, the Escape that closes the grid does not close the form too", async () => {
    const closeForm = vi.fn();
    render(
      <Modal isOpen toggle={closeForm}>
        <ModalBody>
          <Harness initial={3} />
        </ModalBody>
      </Modal>,
    );
    await userEvent.click(toggle());
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Day 3 of the month" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(closeForm).not.toHaveBeenCalled();
    expect(toggle()).toHaveFocus();
  });

  it("an optional day can be cleared", async () => {
    const onChange = vi.fn();
    render(<Harness initial={7} clearable onChange={onChange} />);
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("button", { name: "No day" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
