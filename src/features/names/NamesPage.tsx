import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageShell } from "../../shared/components/PageShell";
import { PageTabs } from "../../shared/components/PageTabs";
import { pageTabIds } from "../../shared/utils/pageTabIds";
import CategoryManager from "../categories/CategoryManager";
import { PayeesTab } from "./PayeesTab";

const NAMES_TABS = ["payees", "categories"] as const;
type NamesTab = (typeof NAMES_TABS)[number];

const isNamesTab = (value: unknown): value is NamesTab => typeof value === "string" && (NAMES_TABS as readonly string[]).includes(value);

/**
 * «Δικαιούχοι & κατηγορίες» (under Transactions): the names the records are
 * filed by, in one place — who was paid, and under what. Two tabs,
 * the one open kept in the address (`?tab=categories`), so Settings can link
 * straight to the categories and «back» lands where it was.
 *
 * Each tab registers its own add with the floating «+» (`usePageAdd`); only
 * the open one is mounted, so the «+» always adds what the tab lists.
 */
export function NamesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: NamesTab = isNamesTab(asked) ? asked : "payees";

  const choose = (next: NamesTab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        return p;
      },
      // «back» leaves the page rather than stepping through each tab looked at.
      { replace: true },
    );

  const ids = pageTabIds("names", tab);

  return (
    <PageShell>
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("names.title")}</h1>
      </div>

      <PageTabs
        base="names"
        label={t("names.title")}
        tabs={[
          { id: "payees", label: t("names.tabPayees") },
          { id: "categories", label: t("names.tabCategories") },
        ]}
        value={tab}
        onChange={choose}
      />

      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab}>
        {tab === "payees" ? <PayeesTab /> : <CategoryManager />}
      </div>
    </PageShell>
  );
}

export default NamesPage;
