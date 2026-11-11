import { describe, it, expect, vi, beforeAll } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { YesNoChoice } from "./YesNoChoice";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

function Harness({ start, onChange }: { start?: boolean; onChange?: (yes: boolean) => void }) {
  const [value, setValue] = useState<boolean | undefined>(start);
  return (
    <YesNoChoice
      question="Is it a loan with interest?"
      value={value}
      onChange={(yes) => {
        setValue(yes);
        onChange?.(yes);
      }}
      whenNo={<p>skipped</p>}
    >
      <label>
        Rate <input />
      </label>
    </YesNoChoice>
  );
}

describe("YesNoChoice", () => {
  it("is a labelled radio group with nothing picked and nothing revealed at first", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Is it a loan with interest?" });
    const [yes, no] = screen.getAllByRole("radio");
    expect(group).toContainElement(yes);
    expect(yes).toHaveAccessibleName("Yes");
    expect(no).toHaveAccessibleName("No");
    expect(yes).toHaveAttribute("aria-checked", "false");
    expect(no).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Rate")).toBeNull();
    expect(screen.queryByText("skipped")).toBeNull();
    // One tab stop while nothing is picked: «Yes».
    expect(yes).toHaveAttribute("tabindex", "0");
    expect(no).toHaveAttribute("tabindex", "-1");
  });

  it("reveals its children only on Yes, and the No content only on No", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText("Rate")).toBeInTheDocument();
    expect(screen.queryByText("skipped")).toBeNull();
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.queryByLabelText("Rate")).toBeNull();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true");
  });

  it("moves and picks with the arrow keys, one tab stop on the picked tile", async () => {
    const onChange = vi.fn();
    render(<Harness start={false} onChange={onChange} />);
    const [yes, no] = screen.getAllByRole("radio");
    expect(no).toHaveAttribute("tabindex", "0");
    expect(yes).toHaveAttribute("tabindex", "-1");

    await userEvent.tab();
    expect(no).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(yes).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText("Rate")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(no).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("takes custom labels and hints, and can hide the question visually", () => {
    render(
      <YesNoChoice
        question="Active?"
        hideQuestion
        value={undefined}
        onChange={() => {}}
        yesLabel="Active"
        noLabel="Paused"
        yesHint="Counts in the plan"
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Active?" })).toBeInTheDocument();
    expect(screen.getByText("Active?")).toHaveClass("visually-hidden");
    expect(screen.getByRole("radio", { name: "Active" })).toHaveAccessibleDescription("Counts in the plan");
    // Nothing picked yet: no hint shows, it only describes its answer.
    expect(screen.getByText("Counts in the plan")).toHaveClass("visually-hidden");
    expect(screen.getByRole("radio", { name: "Paused" })).toBeInTheDocument();
  });

  it("does nothing while disabled", async () => {
    const onChange = vi.fn();
    render(<YesNoChoice question="Q" value={undefined} onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
