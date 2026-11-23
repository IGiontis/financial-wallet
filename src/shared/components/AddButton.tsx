import { Button } from "reactstrap";
import { FiPlus } from "react-icons/fi";

/**
 * The one «+» every page with an add uses, so the pages cannot drift apart:
 * a plain plus, the words in `aria-label` and `title` (the same words the page
 * gives `usePageAdd`, so the floating «+» says the same thing). It never
 * shrinks and never wraps; in a page's header it goes first, on the left, and
 * the title beside it is what wraps (`PageHeader`, which draws it itself).
 */
export function AddButton({ label, onClick, className = "", disabled, small }: { label: string; onClick: () => void; className?: string; disabled?: boolean; /** In a row of small buttons. */ small?: boolean }) {
  const side = small ? "2rem" : "2.75rem";
  return (
    <Button
      color="primary"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex-shrink-0 text-nowrap d-inline-flex align-items-center justify-content-center p-0 ${className}`}
      style={{ width: side, height: side }}
    >
      <FiPlus size={small ? 16 : 20} aria-hidden />
    </Button>
  );
}
