import { createContext, useContext } from "react";

/**
 * True for anything drawn inside the page header's band — provided by
 * `PageHeader`, which is the only thing that sets it.
 */
export const PageBandContext = createContext(false);

/**
 * Am I inside the page header's band?
 *
 * `PageTabs` asks, and draws itself as the band's base — an underline row on
 * the band's bottom edge — instead of the boxes it wears anywhere else (owner,
 * 2026-11-24, «option Β»). One implementation, no page-level copies and no prop
 * to remember: a page just puts its tabs in the header, as it always did.
 */
export const useInPageBand = () => useContext(PageBandContext);
