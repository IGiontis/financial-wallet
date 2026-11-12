/** The ids an underline tab and its panel point at each other by (`UnderlineTabs`). */
export const underlineTabIds = (base: string, tab: string) => ({ tab: `${base}-tab-${tab}`, panel: `${base}-panel-${tab}` });
