import { Button } from "reactstrap";
import { FiPlus } from "react-icons/fi";
import type { ReactNode } from "react";

/**
 * The one «+» every page with an add uses, so the pages cannot drift apart:
 * a plain plus, the words in `aria-label` and `title` (the same words the page
 * gives `usePageAdd`, so the floating «+» says the same thing). It never
 * shrinks and never wraps; in a header it goes first, on the left, and the
 * title beside it is what wraps (see `AddHeader`).
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

/**
 * A page header with its add: the «+» pinned left, the title and subtitle next
 * to it taking the rest of the row and wrapping when it is tight.
 */
export function AddHeader({ label, onAdd, title, subtitle, className = "mb-3", disabled }: { label: string; onAdd: () => void; title: ReactNode; subtitle?: ReactNode; className?: string; /** The «+» greyed out — offline, or nothing more can be added. */ disabled?: boolean }) {
  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      <AddButton label={label} onClick={onAdd} disabled={disabled} />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{title}</h1>
        {subtitle && <p className="small text-body-secondary mb-0">{subtitle}</p>}
      </div>
    </div>
  );
}
