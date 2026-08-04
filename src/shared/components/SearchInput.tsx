import { FiSearch, FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import styles from "./css/SearchInput.module.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Compact height for toolbars; default is comfortable/touch-sized. */
  size?: "sm" | "md";
  className?: string;
  /** Renders full width instead of the default fixed max width. */
  block?: boolean;
  ariaLabel?: string;
}

/**
 * The single search field used across the app: magnifier on the left, a clear
 * (×) button on the right once there is text. Keeps behaviour, sizing and
 * theming consistent everywhere instead of each page rolling its own.
 */
export function SearchInput({ value, onChange, placeholder, size = "md", className = "", block = false, ariaLabel }: SearchInputProps) {
  const { t } = useTranslation();
  const label = placeholder ?? t("common.search");

  return (
    <div className={`${styles.wrapper} ${size === "sm" ? styles.sm : ""} ${block ? styles.block : ""} ${className}`}>
      <FiSearch className={styles.icon} size={size === "sm" ? 14 : 16} aria-hidden />
      <input
        type="search"
        className={styles.input}
        value={value}
        placeholder={label}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className={styles.clear} onClick={() => onChange("")} aria-label={t("common.clear")} title={t("common.clear")}>
          <FiX size={size === "sm" ? 14 : 16} />
        </button>
      )}
    </div>
  );
}
