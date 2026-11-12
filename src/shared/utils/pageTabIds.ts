/** The ids a page tab and its panel point at each other by (`PageTabs`): the tab is `aria-controls` the panel, the panel `aria-labelledby` the tab. */
export const pageTabIds = (base: string, tab: string) => ({ tab: `${base}-tab-${tab}`, panel: `${base}-panel-${tab}` });
