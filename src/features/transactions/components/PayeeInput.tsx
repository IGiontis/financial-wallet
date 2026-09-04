import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { filterPayees, isUnsavedPayee, payeeKey } from "../payeeStore";
import styles from "./css/PayeeInput.module.css";

const MENU_MAX_HEIGHT = 232;
/** Below this the anchored menu gives way to a full-height sheet. */
const SHEET_QUERY = "(max-width: 575.98px)";
const VIEWPORT_MARGIN = 8;
/** Gap between the field and the menu, applied on whichever side it opens. */
const ANCHOR_GAP = 2;

interface PayeeInputProps {
  value: string;
  /** The user's saved list, already sorted. */
  payees: string[];
  invalid?: boolean;
  placeholder?: string;
  /** Locked because the chosen category already fills this in. */
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

/**
 * Picks from the saved payee list without ever blocking free text: the field is
 * an ordinary input that offers matches as you type, and anything unrecognised
 * is offered explicitly as "use this" so a one-off payee needs no setup.
 *
 * The menu is portalled to <body> and positioned against the viewport. Inside a
 * modal an in-flow menu is both clipped by the scrolling body and painted under
 * the neighbouring category select; escaping the modal's overflow and stacking
 * contexts is the only way to reliably clear them.
 *
 * Follows the ARIA combobox pattern — arrow keys move a virtual cursor while
 * focus stays in the input, so typing is never interrupted.
 */
export function PayeeInput({ value, payees, invalid, placeholder, disabled, onChange, onBlur }: PayeeInputProps) {
  const { t } = useTranslation();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);

  // A menu anchored to the field is the wrong shape on a phone: the keyboard
  // takes most of the screen, leaving the list a couple of rows squeezed into
  // whatever is left, inside a modal that is already scrolling. On a narrow
  // screen the same options open as a sheet that owns the screen instead.
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(SHEET_QUERY);
    const sync = () => setNarrow(query.matches);

    // Read once on mount as well as on change: the width can differ from what
    // the initial render saw — a rotation, a resized window, or simply a
    // remount — and a listener alone would keep the stale answer until the
    // next resize.
    sync();
    query.addEventListener("change", sync);
    // Rotation is the case that matters, and not every engine fires the media
    // query listener for it — resize always arrives.
    window.addEventListener("resize", sync);

    return () => {
      query.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  const [storedIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; dropUp: boolean } | null>(null);

  const matches = useMemo(() => filterPayees(payees, value), [payees, value]);
  const showUseTyped = useMemo(() => isUnsavedPayee(payees, value), [payees, value]);

  // One flat list of what Enter can land on, so keyboard and mouse agree.
  const optionCount = matches.length + (showUseTyped ? 1 : 0);

  // Typing shortens the list, so a cursor parked on the old last option can
  // point past the end. Clamping here — rather than resetting it from an
  // effect — keeps it correct without an extra render pass.
  const activeIndex = storedIndex >= optionCount ? -1 : storedIndex;

  const measure = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const box = input.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - VIEWPORT_MARGIN;
    const above = box.top - VIEWPORT_MARGIN;
    // Flip up only when below genuinely can't hold a useful menu and above is better.
    const dropUp = below < Math.min(MENU_MAX_HEIGHT, 140) && above > below;

    setRect({ top: dropUp ? box.top - ANCHOR_GAP : box.bottom + ANCHOR_GAP, left: box.left, width: box.width, dropUp });
  }, []);

  // Measure before paint so the menu never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (open && !narrow) measure();
  }, [open, narrow, optionCount, measure]);

  useEffect(() => {
    if (!open || narrow) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };

    // A fixed menu doesn't travel with its anchor, so follow any scroll or
    // resize. Capture catches scrolling inside the modal body too.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, narrow, measure]);

  const commit = (name: string) => {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (optionCount === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + step + optionCount) % optionCount);
      return;
    }

    if (e.key === "Enter" && open && activeIndex >= 0) {
      // Only swallow Enter when a suggestion is actually highlighted —
      // otherwise it must still submit the form.
      e.preventDefault();
      commit(activeIndex < matches.length ? matches[activeIndex] : value.trim());
      return;
    }

    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const option = (label: string, index: number, isCreate = false) => (
    <div
      key={isCreate ? "__create__" : payeeKey(label)}
      id={`${listId}-opt-${index}`}
      role="option"
      aria-selected={index === activeIndex}
      className={`${styles.option} ${isCreate && matches.length > 0 ? styles.createRow : ""} ${index === activeIndex ? styles.optionActive : ""}`}
      // pointerdown fires before the input's blur, so the click isn't lost to
      // the menu closing first.
      onPointerDown={(e) => {
        e.preventDefault();
        commit(isCreate ? value.trim() : label);
      }}
      onMouseEnter={() => setActiveIndex(index)}
    >
      {isCreate && <FiPlus size={13} className="flex-shrink-0" />}
      <span className={styles.optionName}>{isCreate ? t("transactions.useTypedPayee", { name: value.trim() }) : label}</span>
    </div>
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <Input
        innerRef={inputRef}
        disabled={disabled}
        type="text"
        name="description"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        placeholder={placeholder}
        value={value}
        invalid={invalid}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
      />

      {open &&
        narrow &&
        createPortal(
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("transactions.payee")}>
            <div className={styles.sheetHead}>
              <button type="button" className={styles.sheetClose} onClick={() => setOpen(false)} aria-label={t("common.close")}>
                <FiX size={18} />
              </button>
              <span className={styles.sheetTitle}>{t("transactions.payee")}</span>
            </div>

            <div className={styles.sheetSearch}>
              <Input
                autoFocus
                type="text"
                autoComplete="off"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setOpen(false))}
                aria-label={t("transactions.payee")}
              />
            </div>

            <div className={styles.sheetList} id={listId} role="listbox">
              {matches.map((name) => (
                <button key={payeeKey(name)} type="button" className={styles.sheetOption} onClick={() => commit(name)}>
                  <span className={styles.optionName}>{name}</span>
                  {payeeKey(name) === payeeKey(value) && <FiCheck size={16} style={{ color: "var(--bs-primary)" }} aria-hidden />}
                </button>
              ))}

              {showUseTyped && (
                <button type="button" className={`${styles.sheetOption} ${styles.sheetCreate}`} onClick={() => commit(value.trim())}>
                  <FiPlus size={14} aria-hidden />
                  <span className={styles.optionName}>{t("transactions.useTypedPayee", { name: value.trim() })}</span>
                </button>
              )}

              {optionCount === 0 && <p className={styles.sheetEmpty}>{t("transactions.noPayeeMatches")}</p>}
            </div>
          </div>,
          document.body,
        )}

      {open &&
        !narrow &&
        optionCount > 0 &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            className={styles.menu}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              // Anchoring by transform keeps the menu glued to the field
              // whichever way it opens, without a second measuring pass.
              transform: rect.dropUp ? "translateY(-100%)" : undefined,
              maxHeight: MENU_MAX_HEIGHT,
            }}
          >
            {matches.map((name, i) => option(name, i))}
            {showUseTyped && option(value.trim(), matches.length, true)}
          </div>,
          document.body,
        )}
    </div>
  );
}
