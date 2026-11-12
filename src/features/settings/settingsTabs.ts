// The Settings page in four tabs, each at its own address (/settings/<id>).
//
//   Profile      who you are: name, display name, age, city, country
//   Preferences  how the app shows things: currency, language, theme
//   Data         what you have entered: starting balance, categories,
//                the printable statement, starting over
//   Account      the sign-in itself: email, password (or Google), signing
//                out, deleting the account

export const SETTINGS_TABS = [
  { id: "profile", labelKey: "settings.profile" },
  { id: "preferences", labelKey: "settings.preferences" },
  { id: "data", labelKey: "settings.tabData" },
  { id: "account", labelKey: "settings.tabAccount" },
] as const satisfies readonly { id: string; labelKey: string }[];

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "profile";

export const isSettingsTab = (value: string | undefined): value is SettingsTab => SETTINGS_TABS.some((tab) => tab.id === value);

export const settingsTabPath = (tab: SettingsTab) => `/settings/${tab}`;

/** The `PageTabs` base: tab and panel ids are `pageTabIds(SETTINGS_TABS_BASE, tab)`. */
export const SETTINGS_TABS_BASE = "settings";
