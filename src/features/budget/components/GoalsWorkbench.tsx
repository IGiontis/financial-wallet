import { useState } from "react";
import type { ReactNode } from "react";
import { Input, Offcanvas, OffcanvasBody, OffcanvasHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiGrid, FiList, FiSliders } from "react-icons/fi";
import { SearchInput } from "../../../shared/components/SearchInput";
import { useNarrowScreen } from "../../../shared/hooks/useNarrowScreen";
import { GoalViewToggle } from "./GoalStacks";
import { GROUP_BY_OPTIONS } from "./goalGrouping";
import styles from "./css/GoalsWorkbench.module.css";
import type { GoalView } from "./GoalStacks";
import type { GoalGroupBy } from "./goalGrouping";

// The chrome both goal screens sit in.
//
// They had a copy each of the same header, the same tab strip and the same
// search box, drifting a little apart every time one of them was touched. This
// is the one of them — and the one place the three shapes are decided: a phone
// puts the filters in a sheet, a laptop puts them in the row under the summary,
// a wide screen moves the tabs and the grouping into a rail and gives the list
// its width back.

/** Where the filters live, which is the only thing the width changes. */
const SHEET_QUERY = "(max-width: 767.98px)";

export interface WorkbenchTab {
  id: string;
  label: string;
  count: number;
}

export interface GoalsWorkbenchProps {
  title: string;
  subtitle: string;
  /** The primary button — "new goal". Placed by the shell, owned by the page. */
  action: ReactNode;
  /** The summary boxes, which differ per screen. */
  stats?: ReactNode;
  tabs: WorkbenchTab[];
  activeTab: string;
  onTab: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  /** Which dimensions this screen can stack by — deadlines mean nothing on a recurring one. */
  groupOptions: GoalGroupBy[];
  groupBy: GoalGroupBy;
  onGroupBy: (by: GoalGroupBy) => void;
  view: GoalView;
  onView: (view: GoalView) => void;
  children: ReactNode;
}

export function GoalsWorkbench({
  title,
  subtitle,
  action,
  stats,
  tabs,
  activeTab,
  onTab,
  search,
  onSearch,
  searchPlaceholder,
  groupOptions,
  groupBy,
  onGroupBy,
  view,
  onView,
  children,
}: GoalsWorkbenchProps) {
  const { t } = useTranslation();
  const narrow = useNarrowScreen(SHEET_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);

  const options = GROUP_BY_OPTIONS.filter((option) => groupOptions.includes(option.value));
  // Grouping only reaches the screen in the list view, so the control that sets
  // it has nothing to say while the cards are up.
  const grouping = view === "stacks" && options.length > 1;
  // On a phone, anything chosen that is not the first choice gets a dot on the
  // one button, so a regrouped list is never a mystery.
  const changed = view === "stacks" && options.length > 0 && groupBy !== options[0].value;

  const tabStrip = (
    <div className={styles.tabs} role="tablist" aria-label={title}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`${styles.tab} ${tab.id === activeTab ? styles.tabOn : ""}`}
          onClick={() => onTab(tab.id)}
        >
          <span>{tab.label}</span>
          <span className={styles.tabCount}>{tab.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className={styles.header}>
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{title}</h1>
          <p className="small text-body-secondary mb-0">{subtitle}</p>
        </div>
        <div className={styles.headActions}>{action}</div>
      </div>

      <div className={styles.layout}>
        {/* Wide screens only. The same two lists as the tab strip and the
            grouping control, laid out where there is room for them to be read
            rather than squeezed. */}
        <aside className={styles.rail}>
          <p className={styles.railTitle}>{title}</p>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.railItem} ${tab.id === activeTab ? styles.railItemOn : ""}`}
              aria-pressed={tab.id === activeTab}
              onClick={() => onTab(tab.id)}
            >
              <span>{tab.label}</span>
              <span className={styles.railCount}>{tab.count}</span>
            </button>
          ))}

          {grouping && (
            <>
              <div className={styles.railRule} />
              <p className={styles.railTitle}>{t("goals.groupBy")}</p>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.railItem} ${option.value === groupBy ? styles.railItemOn : ""}`}
                  aria-pressed={option.value === groupBy}
                  onClick={() => onGroupBy(option.value)}
                >
                  <span>{t(option.labelKey)}</span>
                </button>
              ))}
            </>
          )}
        </aside>

        <main className={styles.main}>
          {/* On a phone the boxes are one row that scrolls sideways, rather
              than three rows that filled the whole first screen. */}
          {stats && <div className={styles.stats}>{stats}</div>}

          {/* The controls follow the page down. Twenty goals is four screens of
              scrolling, and having to come back to the top to change tab or
              regrouping is the reason nobody does it. */}
          <div className={styles.controls}>
            {tabStrip}
            <div className={styles.toolbar}>
              <div className={styles.search}>
                <SearchInput value={search} onChange={onSearch} placeholder={searchPlaceholder} block />
              </div>

              {/* A phone gets one button beside the field — how to look at the
                  goals, and how to group them, in a sheet from the bottom — in
                  place of a filter button and a view toggle squeezed in beside
                  a search box with no room left to type in. */}
              {narrow ? (
                <button type="button" className={styles.filterBtn} onClick={() => setSheetOpen(true)} aria-label={t("goals.viewAndGroup")}>
                  <FiSliders size={15} aria-hidden />
                  {view === "stacks" ? <FiList size={15} aria-hidden /> : <FiGrid size={15} aria-hidden />}
                  {changed && <span className={styles.filterMark} aria-hidden />}
                </button>
              ) : (
              <>
              {/* A menu where there is room beside the field, and none once the
                  rail is carrying the same choice. */}
              <span className={styles.groupSlot}>
                {grouping && (
                    <Input
                      type="select"
                      bsSize="sm"
                      className={styles.groupPick}
                      value={groupBy}
                      onChange={(event) => onGroupBy(event.target.value as GoalGroupBy)}
                      aria-label={t("goals.groupBy")}
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t("goals.groupBy")}: {t(option.labelKey)}
                        </option>
                      ))}
                    </Input>
                  )}
              </span>

              <GoalViewToggle view={view} onChange={onView} />
              </>
              )}
            </div>
          </div>

          {children}
        </main>
      </div>

      {/* From the bottom, where a thumb is, over the page rather than instead
          of it; every choice applies as it is tapped. */}
      <Offcanvas isOpen={narrow && sheetOpen} toggle={() => setSheetOpen(false)} direction="bottom" className={styles.sheet}>
        <OffcanvasHeader toggle={() => setSheetOpen(false)}>{t("goals.viewAndGroup")}</OffcanvasHeader>
        <OffcanvasBody>
          <div className={styles.sheetGroup}>
            <p className={styles.railTitle} style={{ marginLeft: 2 }}>
              {t("goals.viewLabel")}
            </p>
            <div className={styles.sheetSeg} role="group" aria-label={t("goals.viewLabel")}>
              <button type="button" className={`${styles.pick} ${view === "cards" ? styles.pickOn : ""}`} aria-pressed={view === "cards"} onClick={() => onView("cards")}>
                <FiGrid size={15} aria-hidden /> {t("goals.viewCards")}
              </button>
              <button type="button" className={`${styles.pick} ${view === "stacks" ? styles.pickOn : ""}`} aria-pressed={view === "stacks"} onClick={() => onView("stacks")}>
                <FiList size={15} aria-hidden /> {t("goals.viewStacks")}
              </button>
            </div>
          </div>

          {/* Grouping shapes the list only; with the cards up it would be a
              choice that changes nothing on screen. */}
          {grouping && (
            <div className={styles.sheetGroup}>
              <p className={styles.railTitle} style={{ marginLeft: 2 }}>
                {t("goals.groupBy")}
              </p>
              <div className={styles.sheetPicks}>
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.pick} ${option.value === groupBy ? styles.pickOn : ""}`}
                    aria-pressed={option.value === groupBy}
                    onClick={() => onGroupBy(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </OffcanvasBody>
      </Offcanvas>
    </>
  );
}
