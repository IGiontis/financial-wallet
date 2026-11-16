import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiFilter, FiLayers } from "react-icons/fi";
import { SearchInput } from "../../../shared/components/SearchInput";
import { SkeletonCardGrid, SkeletonRows } from "../../../shared/components/Skeletons";
import { PageWaiting } from "../../../shared/components/PageWaiting";
import type { PageLoad } from "../../../shared/hooks/usePageLoad";
import { PageTabs } from "../../../shared/components/PageTabs";
import { pageTabIds } from "../../../shared/utils/pageTabIds";
import { GoalPickMenu } from "./GoalPickMenu";
import { GROUP_BY_OPTIONS } from "./goalGrouping";
import { countByStatus, filterGoals, type GoalStatusOption } from "./goalOverview";
import { GOAL_TABS, useGoalTab, type GoalTab } from "./useGoalTab";
import styles from "./css/GoalsWorkbench.module.css";
import type { GoalGroupBy } from "./goalGrouping";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// The chrome both goal screens sit in: heading, then three tabs —
// «Επισκόπηση · Κάρτες · Λίστα».
//
// Each tab stands on its own. The overview is the screen's figures; the cards
// and the list each have their own search and their own «Όλοι ▾», so looking
// for one goal in the list does not leave the cards filtered behind it. The tab
// is in the address and remembered on the device (`useGoalTab`).

const TAB_LABEL: Record<GoalTab, string> = {
  overview: "goals.tabOverview",
  cards: "goals.tabCards",
  list: "goals.tabList",
};

/** What a tab of goals keeps of its own: what is typed and which status. */
interface BrowseState {
  search: string;
  status: string;
}

export interface GoalsWorkbenchProps {
  /** «goals» or «investments»: the keys the tab and the stacks are remembered under. */
  screen: string;
  title: string;
  subtitle: string;
  /** The primary button — "new goal". Placed by the shell, owned by the page. */
  action: ReactNode;
  /** This screen's goals, every status. */
  goals: InvestmentGoalWithStats[];
  /**
   * Where the goals stand (`usePageLoad`): the skeleton, the page, or — still
   * nothing after the skeleton's time — a quiet line in every tab (the add stays).
   */
  load: PageLoad;
  /** The «Όλοι ▾» choices, the first being where a tab starts. */
  statuses: GoalStatusOption[];
  /** The «Επισκόπηση» tab, whole. */
  overview: ReactNode;
  searchPlaceholder: string;
  /** Which dimensions this screen can stack by — deadlines mean nothing on a recurring one. */
  groupOptions: GoalGroupBy[];
  groupBy: GoalGroupBy;
  onGroupBy: (by: GoalGroupBy) => void;
  /** `status` is the status filter picked («paused» lists only paused ones). */
  renderCards: (goals: InvestmentGoalWithStats[], status: string) => ReactNode;
  renderList: (goals: InvestmentGoalWithStats[]) => ReactNode;
  /** What an empty tab says, when nothing is searched and every status is shown. */
  empty: ReactNode;
}

export function GoalsWorkbench({
  screen,
  title,
  subtitle,
  action,
  goals,
  load,
  statuses,
  overview,
  searchPlaceholder,
  groupOptions,
  groupBy,
  onGroupBy,
  renderCards,
  renderList,
  empty,
}: GoalsWorkbenchProps) {
  const { t } = useTranslation();
  const base = useId();
  const [tab, setTab] = useGoalTab(screen);
  const start: BrowseState = { search: "", status: statuses[0]?.id ?? "" };
  const [browse, setBrowse] = useState<Record<Exclude<GoalTab, "overview">, BrowseState>>({ cards: start, list: start });

  const counts = useMemo(() => countByStatus(goals, statuses), [goals, statuses]);
  const statusPicks = useMemo(() => statuses.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] })), [statuses, counts]);
  const groupPicks = useMemo(
    () => GROUP_BY_OPTIONS.filter((option) => groupOptions.includes(option.value)).map((option) => ({ id: option.value, label: t(option.labelKey) })),
    [groupOptions, t],
  );

  const panel = (which: GoalTab, body: ReactNode) => {
    const ids = pageTabIds(base, which);
    return (
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={styles.panel}>
        {body}
      </div>
    );
  };

  const browseTab = (which: Exclude<GoalTab, "overview">) => {
    if (load === "waiting") return <PageWaiting />;
    const state = browse[which];
    const set = (patch: Partial<BrowseState>) => setBrowse((prev) => ({ ...prev, [which]: { ...prev[which], ...patch } }));
    const option = statuses.find((s) => s.id === state.status) ?? statuses[0];
    const shown = filterGoals(goals, option, state.search);
    const searching = state.search.trim().length > 0;
    const narrowed = option !== statuses[0];

    return (
      <>
        {/* The row follows the page down from a tablet up: twenty goals is four
            screens, and coming back to the top to search again is the reason
            nobody does. Phones keep it in place — the height is the scarce thing. */}
        <div className={styles.controls}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <SearchInput value={state.search} onChange={(search) => set({ search })} placeholder={searchPlaceholder} block />
            </div>
            <GoalPickMenu label={t("goals.statusLabel")} value={option?.id ?? ""} options={statusPicks} onChange={(status) => set({ status })} icon={FiFilter} />
            {which === "list" && groupPicks.length > 1 && (
              <GoalPickMenu label={t("goals.groupBy")} value={groupBy} options={groupPicks} onChange={(by) => onGroupBy(by as GoalGroupBy)} icon={FiLayers} compact />
            )}
          </div>
          {searching && <p className={styles.results}>{t("investments.showingResults", { count: shown.length })}</p>}
        </div>

        {load === "loading" ? (
          which === "cards" ? (
            <SkeletonCardGrid count={6} />
          ) : (
            <SkeletonRows count={6} />
          )
        ) : shown.length > 0 ? (
          which === "cards" ? (
            renderCards(shown, option?.id ?? "")
          ) : (
            renderList(shown)
          )
        ) : searching || narrowed ? (
          <div className={styles.empty}>
            <p className="fw-medium mb-2">{searching ? t("investments.noResultsFor", { query: state.search.trim() }) : t("goals.noneWithStatus", { status: option?.label ?? "" })}</p>
            {narrowed && (
              <Button color="secondary" outline size="sm" onClick={() => set({ status: statuses[0].id })}>
                {t("goals.showAllStatuses", { status: statuses[0].label })}
              </Button>
            )}
          </div>
        ) : (
          empty
        )}
      </>
    );
  };

  return (
    <>
      {/* The add («+», `AddButton`) pinned left; the title beside it is what wraps. */}
      <div className={styles.header}>
        <div className={styles.headActions}>{action}</div>
        <div className={styles.headText}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{title}</h1>
          <p className="small text-body-secondary mb-0">{subtitle}</p>
        </div>
      </div>

      {/* `goal-views` and each tab's `data-view` are what the demo's guided tour
          presses to put the cards on screen before it points at one. */}
      <PageTabs
        base={base}
        label={title}
        tabs={GOAL_TABS.map((id) => ({ id, label: t(TAB_LABEL[id]) }))}
        value={tab}
        onChange={setTab}
        data-tour="goal-views"
      />

      {tab === "overview" && panel("overview", load === "waiting" ? <PageWaiting /> : overview)}
      {tab === "cards" && panel("cards", browseTab("cards"))}
      {tab === "list" && panel("list", browseTab("list"))}
    </>
  );
}
