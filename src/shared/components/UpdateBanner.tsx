import { useTranslation } from "react-i18next";
import { Button } from "reactstrap";
import { FiRefreshCw } from "react-icons/fi";
import { useAppUpdate } from "../hooks/useAppUpdate";

/**
 * The one thing standing between a published build and the reader having it.
 *
 * Deliberately a prompt rather than an automatic reload: this is an app people
 * type amounts into, and a page that reloads itself mid-form is a worse bug
 * than an old version. It also has to be mounted unconditionally — the hook
 * inside it is what registers the service worker at all — so it renders nothing
 * until there is something to say.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const { needRefresh, apply } = useAppUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="shadow d-flex align-items-center gap-2"
      style={{
        position: "fixed",
        // Both edges pinned and auto margins, rather than left:50% and a
        // transform: a fixed box sizes to the space it is given, and starting it
        // at the halfway mark leaves it half a phone to work with — which on a
        // 375px screen wrapped four words onto three lines.
        left: 12,
        right: 12,
        marginInline: "auto",
        width: "fit-content",
        maxWidth: 420,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 2100,
        background: "var(--color-surface-raised)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border-primary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "8px 8px 8px 14px",
        fontSize: 13,
      }}
    >
      <FiRefreshCw size={15} aria-hidden style={{ flexShrink: 0, opacity: 0.8 }} />
      <span className="flex-grow-1">{t("common.updateReady")}</span>
      {/* Full height rather than `size="sm"`: measured at 375px the small one is
          a 31px target, and this is a one-tap control on a phone. */}
      <Button color="primary" onClick={apply} className="flex-shrink-0">
        {t("common.updateNow")}
      </Button>
    </div>
  );
}
