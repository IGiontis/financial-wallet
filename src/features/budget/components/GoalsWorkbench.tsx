import { useState } from "react";
import type { ReactNode } from "react";
import { Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiFilter, FiX } from "react-icons/fi";
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
          {stats}

          {/* The controls follow the page down. Twenty goals is four screens of
              scrolling, and having to come back to the top to change tab or
              regrouping is the reason nobody does it. */}
          <div className={styles.controls}>
            {tabStrip}
            <div className={styles.toolbar}>
              <div className={styles.search}>
                <SearchInput value={search} onChange={onSearch} placeholder={searchPlaceholder} block />
              </div>

              {/* One control, two shapes: a menu where there is room beside the
                  field, a sheet where there is not, and neither once the rail is
                  carrying the same choice. */}
              <span className={styles.groupSlot}>
                {grouping &&
                  (narrow ? (
                    <button type="button" className={styles.filterBtn} onClick={() => setSheetOpen(true)}>
                      <FiFilter size={14} aria-hidden />
                      {t("goals.filters")}
                      {groupBy !== options[0].value && <span className={styles.filterMark} aria-hidden />}
                    </button>
                  ) : (
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
                  ))}
              </span>

              <GoalViewToggle view={view} onChange={onView} />
            </div>
          </div>

          {children}
        </main>
      </div>

      {/* A phone has no room beside the field for a menu, so the choice takes
          the screen instead — the same shape the payee picker uses. */}
      {sheetOpen && (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("goals.filters")}>
          <div className={styles.sheetHead}>
            <span className={styles.sheetTitle}>{t("goals.filters")}</span>
            <button type="button" className={styles.sheetClose} onClick={() => setSheetOpen(false)} aria-label={t("common.close")}>
              <FiX size={20} />
            </button>
          </div>

          <div className={styles.sheetBody}>
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

            <div className={styles.sheetGroup}>
              <p className={styles.railTitle} style={{ marginLeft: 2 }}>
                {t("goals.viewLabel")}
              </p>
              <div className={styles.sheetPicks}>
                <button type="button" className={`${styles.pick} ${view === "cards" ? styles.pickOn : ""}`} aria-pressed={view === "cards"} onClick={() => onView("cards")}>
                  {t("goals.viewCards")}
                </button>
                <button type="button" className={`${styles.pick} ${view === "stacks" ? styles.pickOn : ""}`} aria-pressed={view === "stacks"} onClick={() => onView("stacks")}>
                  {t("goals.viewStacks")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
