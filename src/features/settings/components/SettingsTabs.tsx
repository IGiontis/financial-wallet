import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import segmented from "../../../shared/css/Segmented.module.css";
import { SETTINGS_PANEL_ID, SETTINGS_TABS, settingsTabId, settingsTabPath, type SettingsTab } from "../settingsTabs";
import styles from "../css/SettingsPage.module.css";

/**
 * Profile · Preferences · Data · Account, in the segmented control the Overview
 * uses for its own tabs — four equal buttons that fit a 375px phone without
 * scrolling, icon above word there, side by side from `sm` up.
 *
 * Each press changes the address, so the browser's back button steps back
 * through them and a link can open any one directly. The arrow keys, Home and
 * End move between them as a tab strip should; only the chosen tab is in the
 * Tab order.
 */
export function SettingsTabs({ current }: { current: SettingsTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const select = (tab: SettingsTab, focus = false) => {
    if (tab !== current) navigate(settingsTabPath(tab));
    if (focus) document.getElementById(settingsTabId(tab))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SETTINGS_TABS.findIndex((tab) => tab.id === current);
    const last = SETTINGS_TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % SETTINGS_TABS.length
      : event.key === "ArrowLeft" ? (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    select(SETTINGS_TABS[next].id, true);
  };

  return (
    <div className={`${segmented.group} ${segmented.even} ${styles.tabBar} mb-3`} role="tablist" aria-label={t("settings.title")} onKeyDown={onKeyDown}>
      {SETTINGS_TABS.map(({ id, labelKey, icon: Icon }) => {
        const selected = id === current;
        return (
          <button
            key={id}
            id={settingsTabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={SETTINGS_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            className={`${segmented.item} ${selected ? segmented.active : ""} ${styles.tabButton}`}
            onClick={() => select(id)}
          >
            <Icon size={16} aria-hidden />
            <span>{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
