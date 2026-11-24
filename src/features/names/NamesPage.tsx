import { useTranslation } from "react-i18next";
import { PageShell } from "../../shared/components/PageShell";
import { PageHeader } from "../../shared/components/PageHeader";
import CategoryManager from "../categories/CategoryManager";
import { PayeesTab } from "./PayeesTab";

/** Which of the two pages this is — one route each (`/names/payees`, `/names/categories`). */
export type NamesView = "payees" | "categories";

/**
 * «Δικαιούχοι & κατηγορίες»: the names the records are filed by, in one place —
 * who was paid, and under what.
 *
 * Its own entry in the menu with two child routes (owner, 2026-11-19): the two
 * halves used to be tabs of one page under «Συναλλαγές», and a section's
 * sub-pages are child routes, never inner tabs (`.claude/rules/ui.md` 2). The
 * old `?tab=` addresses are sent to the right page by `NamesRedirect`.
 *
 * Each page registers its own add with the floating «+» (`usePageAdd`), so the
 * «+» always adds what the page lists.
 */
export function NamesPage({ view = "payees" }: { view?: NamesView } = {}) {
  const { t } = useTranslation();

  return (
    <PageShell>
      <PageHeader title={t("names.title")} subtitle={t("names.subtitle")} />
      {view === "categories" ? <CategoryManager /> : <PayeesTab />}
    </PageShell>
  );
}

export default NamesPage;
