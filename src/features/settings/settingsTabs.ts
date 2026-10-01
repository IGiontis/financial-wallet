import type { IconType } from "react-icons";
import { FiDatabase, FiGlobe, FiLock, FiUser } from "react-icons/fi";

// The Settings page in four tabs, each at its own address (/settings/<id>).
//
//   Profile      who you are: name, display name, age, city, country
//   Preferences  how the app shows things: currency, language, theme
//   Data         what you have entered: starting balance, categories,
//                the printable statement, starting over
//   Account      the sign-in itself: email, password (or Google), signing
//                out, deleting the account

export const SETTINGS_TABS = [
  { id: "profile", labelKey: "settings.profile", icon: FiUser },
  { id: "preferences", labelKey: "settings.preferences", icon: FiGlobe },
  { id: "data", labelKey: "settings.tabData", icon: FiDatabase },
  { id: "account", labelKey: "settings.tabAccount", icon: FiLock },
] as const satisfies readonly { id: string; labelKey: string; icon: IconType }[];

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "profile";

export const isSettingsTab = (value: string | undefined): value is SettingsTab => SETTINGS_TABS.some((tab) => tab.id === value);

export const settingsTabPath = (tab: SettingsTab) => `/settings/${tab}`;

/** The ids that tie each tab to the one panel it shows. */
export const settingsTabId = (tab: SettingsTab) => `settings-tab-${tab}`;
export const SETTINGS_PANEL_ID = "settings-panel";
