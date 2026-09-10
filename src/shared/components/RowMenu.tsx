import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { FiMoreVertical } from "react-icons/fi";
import styles from "../css/RowMenu.module.css";

// The ⋮ menu on a row, and why it is not reactstrap's.
//
// reactstrap positions its dropdowns with Popper through react-popper. In this
// app Popper never wrote an offset: the menu came out at the top-left corner of
// the page with `position: absolute; left: 0; top: 0` and nothing else — with
// the modifiers, without them, portalled or in place. That was masked for a long
// time by a stylesheet rule that pinned the menu under its toggle with
// `!important`, which worked on a card and then cut the menu in half the first
// time one appeared inside a container with `overflow: hidden`.
//
// This positions with Floating UI instead, which was already installed. The menu
// is rendered on the body, so no ancestor can clip it; `flip` turns it upwards
// near the bottom of the screen, `shift` pulls it back from the right edge, and
// `size` caps its height to the room actually available. Keyboard and dismissal
// behaviour come from the same library rather than being hand-rolled.

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Drawn in the expense colour — delete, and nothing else so far. */
  danger?: boolean;
  icon?: ReactNode;
}

/** A rule between groups of items. */
export const MENU_DIVIDER = "divider" as const;

export type RowMenuEntry = RowMenuItem | typeof MENU_DIVIDER;

export function RowMenu({
  label,
  entries,
  className,
  menuClassName,
  header,
  children,
}: {
  label: string;
  entries: RowMenuEntry[];
  className?: string;
  menuClassName?: string;
  /** A block above the items — the account card on the top bar. */
  header?: ReactNode;
  /** The trigger's own content. The three dots when nothing is given. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Named `anchor` rather than `refs`: these are Floating UI setters, not React
  // refs, and a variable called `refs` trips the hooks lint rule that guards
  // against reading `ref.current` while rendering.
  const { refs: anchor, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    // Fixed, so a scrolling ancestor cannot drag the menu away from its toggle.
    strategy: "fixed",
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          // Never taller than the room left on screen; the list scrolls instead
          // of running off the bottom.
          elements.floating.style.maxHeight = `${Math.max(Math.round(availableHeight), 120)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Only the real items are focusable; the dividers hold a null and are skipped.
  const listRef = useRef<(HTMLElement | null)[]>([]);
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true, focusItemOnOpen: false }),
  ]);

  // Where each entry sits in the focusable list — dividers are not focusable and
  // take -1, so arrow keys step over them.
  const slots = entries.reduce<number[]>((acc, entry) => {
    acc.push(entry === MENU_DIVIDER ? -1 : acc.filter((slot) => slot >= 0).length);
    return acc;
  }, []);

  return (
    <>
      <button
        type="button"
        ref={anchor.setReference}
        className={`${styles.toggle} ${className ?? ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        {...getReferenceProps()}
      >
        {children ?? <FiMoreVertical size={16} aria-hidden />}
      </button>

      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            {/* eslint-disable-next-line react-hooks/refs -- `setFloating` is a Floating UI
                callback ref, not a React ref object; nothing reads `.current` here. */}
            <div ref={anchor.setFloating} className={`${styles.menu} ${menuClassName ?? ""}`} style={floatingStyles} aria-label={label} {...getFloatingProps()}>
              {header}
              {entries.map((entry, position) => {
                if (entry === MENU_DIVIDER) return <div key={`rule-${position}`} className={styles.divider} role="separator" />;

                const at = slots[position];
                return (
                  <button
                    key={entry.label}
                    type="button"
                    role="menuitem"
                    ref={(node) => {
                      listRef.current[at] = node;
                    }}
                    tabIndex={activeIndex === at ? 0 : -1}
                    disabled={entry.disabled}
                    className={`${styles.item} ${entry.danger ? styles.danger : ""}`}
                    {...getItemProps({
                      onClick() {
                        if (entry.disabled) return;
                        setOpen(false);
                        entry.onSelect();
                      },
                    })}
                  >
                    {entry.icon}
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
