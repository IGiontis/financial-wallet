import type { CSSProperties } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";

interface DeleteButtonProps {
  onClick: () => void;
  /** What it says beside the bin; "Delete" unless told otherwise. */
  label?: string;
  /** Only the bin — for a row with no room for a word. Still named for a screen reader. */
  iconOnly?: boolean;
  /** The word from `sm` up, the bin alone on a phone. */
  wordFromSm?: boolean;
  size?: "sm";
  disabled?: boolean;
  /** Why it is disabled, when it is. */
  title?: string;
  /** A fuller name for a screen reader: "Delete Netflix" rather than "Delete". */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one way the app asks to delete something: a red outlined button with a
 * bin, and the word when there is room for it.
 *
 * Deletes had grown five looks — red underlined text, a grey button with a red
 * bin, a bare icon, an ✕, the outlined button — so the same action read as a
 * different thing on every screen, and the link-looking one read as nothing
 * dangerous at all. This is what opens the "are you sure"; the confirm inside
 * it stays the solid red button it already is everywhere.
 */
export function DeleteButton({ onClick, label, iconOnly = false, wordFromSm = false, size, disabled, title, ariaLabel, className, style }: DeleteButtonProps) {
  const { t } = useTranslation();
  const text = label ?? t("common.delete");

  return (
    <Button
      type="button"
      color="danger"
      outline
      size={size}
      disabled={disabled}
      onClick={onClick}
      title={title ?? (iconOnly || wordFromSm ? text : undefined)}
      aria-label={ariaLabel ?? (iconOnly || wordFromSm ? text : undefined)}
      className={`d-inline-flex align-items-center justify-content-center gap-1 flex-shrink-0 text-nowrap ${className ?? ""}`}
      style={style}
    >
      <FiTrash2 size={size === "sm" ? 13 : 15} aria-hidden />
      {!iconOnly && <span className={wordFromSm ? "d-none d-sm-inline" : undefined}>{text}</span>}
    </Button>
  );
}

export default DeleteButton;
