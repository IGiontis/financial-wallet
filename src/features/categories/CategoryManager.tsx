import { useMemo, useState } from "react";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { celebrateSave, useSavedFlash } from "../../shared/feedback/saveFeedback";
import { Alert, Badge, Button, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Skeleton, SkeletonRows } from "../../shared/components/Skeletons";
import { FiEdit2, FiGitMerge, FiTrash2 } from "react-icons/fi";
import { categoryAliases, groupCategories, type CategoryGroup, type CategoryScope } from "../../shared/utils/categoryNames";
import { categoryLabel } from "../../shared/utils/categories";
import { similarPairs } from "../../shared/utils/nameMatch";
import { useCategories, useCreateCategoryScope, useUpdateCategoryGroup, useDeleteCategoryGroup, useTransactions } from "../transactions/hooks/useTransactions";
import { payeeMatch } from "../transactions/payeeStore";
import { useBills } from "../bills/useBills";
import { useIncomeList } from "../incomes/useIncomes";
import { INCOMES_KEY } from "../incomes/incomesUtils";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { PLANNER_KEYS, cleanLines } from "../plannerPage/plannerInputs";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import CategoryModal from "./CategoryModal";
import { categoryUsage, totalUsage, type CategoryUsage } from "./categoryUsage";
import { typesToAdd } from "./categoryScope";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useLoadMore } from "../../shared/hooks/useLoadMore";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { AddButton } from "../../shared/components/AddButton";
import { SearchInput } from "../../shared/components/SearchInput";
import { RowMenu, type RowMenuEntry } from "../../shared/components/RowMenu";
import { CategoryMergeModal } from "../names/CategoryMergeModal";
import { SimilarPairs } from "../names/SimilarPairs";
import { groupKey, mergeTargets, type CategoryMergePlan } from "../names/categoryMerge";
import { useMergeCategories } from "../names/useNameActions";
import styles from "../names/css/Names.module.css";

/** Badge wording per scope — "both" is the one worth calling out. */
const SCOPE_LABEL = { expense: "transactions.expense", income: "transactions.income", both: "categories.both" } as const;
const SCOPE_COLOR = { expense: "secondary", income: "success", both: "primary" } as const;

/** The kinds of record the delete dialog names, in the order it names them. */
const USAGE_KINDS: (keyof CategoryUsage)[] = ["transactions", "bills", "incomes", "plannerLines"];

/** Rows drawn at a time; the next ones arrive as the end comes into view. */
const PAGE = 40;

/**
 * Everything that can point at a category, from what the app already holds:
 * nothing is read to ask. `ready` once each list has arrived — counting
 * against a list still on its way would let a category in use be deleted.
 * `stored` carries the incomes and Planner lines as stored, for a merge to
 * rewrite: every entry, untouched but for its category.
 */
function useUsageSources() {
  const transactions = useTransactions();
  const bills = useBills();
  const { incomes, isLoading: incomesLoading } = useIncomeList();
  const [storedLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const [storedIncomes] = useWorkspaceSetting<unknown[]>(INCOMES_KEY, []);
  const plannerLines = useMemo(() => cleanLines(storedLines), [storedLines]);
  const ready = transactions.isSuccess && bills.isSuccess && !incomesLoading;
  const sources = useMemo(() => ({ transactions: transactions.data ?? [], bills: bills.data ?? [], incomes, plannerLines }), [transactions.data, bills.data, incomes, plannerLines]);
  const stored = useMemo(
    () => ({ ...sources, incomes: Array.isArray(storedIncomes) ? storedIncomes : [], plannerLines: Array.isArray(storedLines) ? (storedLines as unknown[]) : [] }),
    [sources, storedIncomes, storedLines],
  );
  return { ready, sources, stored };
}

/**
 * «Κατηγορίες» on the «Δικαιούχοι & κατηγορίες» page (Settings links here):
 * every category, built-in and the user's own, with how many transactions each
 * carries. The user's own can be edited (a rename is one write — a record keeps
 * the category's id, not its name), merged into another, or deleted while
 * nothing uses them (item 28's guard).
 *
 * The built-in ones are shared documents, so they are listed to read and to
 * merge into, never edited. Listed by group rather than by document, so a
 * category that works both ways is one row wearing a "Both" badge.
 */
export default function CategoryManager() {
  const { t } = useTranslation();
  const { data: categories = [], isLoading } = useCategories();

  const createCategory = useCreateCategoryScope();
  const updateCategory = useUpdateCategoryGroup();
  const deleteCategory = useDeleteCategoryGroup();
  const mergeCategories = useMergeCategories();
  const deleteGuard = useOfflineGuard("delete");
  const { ready: usageReady, sources, stored } = useUsageSources();

  const [editing, setEditing] = useState<CategoryGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryGroup | null>(null);
  const [merging, setMerging] = useState<{ drop: CategoryGroup; into?: CategoryGroup } | null>(null);
  const [query, setQuery] = useState("");

  const label = (g: CategoryGroup) => categoryLabel(g.name, t);
  const groups = useMemo(() => groupCategories(categories).sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t))), [categories, t]);
  const shown = useMemo(() => (query.trim() ? groups.filter((g) => payeeMatch(categoryLabel(g.name, t), query)) : groups), [groups, query, t]);
  const { limit, hasMore, more, sentinel } = useLoadMore(shown.length, PAGE, query);

  // Transactions per category document, counted once from the list held.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of sources.transactions) if (tx.categoryId) map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + 1);
    return map;
  }, [sources.transactions]);
  const countOf = (g: CategoryGroup) => g.members.reduce((sum, m) => sum + (counts.get(m.id) ?? 0), 0);

  // Two rows that look like one, where one of them could go into the other.
  const pairs = useMemo(
    () =>
      similarPairs(
        groups,
        (g) => [categoryLabel(g.name, t), ...categoryAliases(g.name)],
        (a, b) => mergeTargets(a.members, b.members) !== null || mergeTargets(b.members, a.members) !== null,
      ),
    [groups, t],
  );

  // The category just made, edited or merged into lights once its dialog has gone.
  const categoryFlash = useSavedFlash("categories", useMemo(() => groups.flatMap((g) => g.members.map((m) => m.id)), [groups]));
  const defaultCount = categories.filter((c) => c.isDefault).length;
  const hasOwn = categories.some((c) => !c.isDefault);

  usePageAdd(t("categories.new"), () => setCreating(true));

  // Both halves of a «both» at once: a pair is deleted together, so it is in
  // use if either half is.
  const usage = useMemo(() => (deleteTarget && usageReady ? categoryUsage(deleteTarget.members.map((m) => m.id), sources) : null), [deleteTarget, usageReady, sources]);
  const inUse = usage !== null && totalUsage(usage) > 0;

  // Each runs once and waits for the server; its dialog is locked meanwhile
  // and the toast says how it went (`.claude/rules/ui.md`).
  const [runDelete, deleting] = useRunOnce();
  const confirmDelete = () =>
    runDelete(async () => {
      if (!deleteTarget || usage === null || inUse) return;
      const group = deleteTarget;
      try {
        await deleteCategory.mutateAsync(group.members.map((m) => m.id));
      } catch {
        toast.error(t("toasts.categoryDeleteFailed"));
        return;
      }
      setDeleteTarget(null);
      toast.success(t("toasts.categoryDeleted", { name: label(group) }));
    });
  const closeDelete = () => {
    if (!deleting) setDeleteTarget(null);
  };

  const merge = async (plan: CategoryMergePlan) => {
    try {
      await mergeCategories.mutateAsync(plan);
    } catch (error) {
      toast.error(t("names.saveFailed"));
      throw error;
    }
    celebrateSave({ collection: "categories", id: Object.values(plan.pairs)[0] });
    toast.success(t("toasts.categoriesMerged"));
    setMerging(null);
  };

  const [runCreate, creatingNow] = useRunOnce();
  const create = (values: { name: string; icon: string; scope: CategoryScope }) =>
    runCreate(async () => {
      try {
        await createCategory.mutateAsync(values);
      } catch {
        toast.error(t("toasts.categorySaveFailed"));
        return;
      }
      // Its id is the server's: the row that appears is the one lit.
      celebrateSave({ collection: "categories" });
      toast.success(t("toasts.categoryCreated", { name: values.name }));
      setCreating(false);
    });

  /** The one that goes into the other: one of the user's own, the less used. */
  const mergePair = ([a, b]: [CategoryGroup, CategoryGroup]) => {
    const aIntoB = mergeTargets(a.members, b.members) !== null;
    const bIntoA = mergeTargets(b.members, a.members) !== null;
    const drop = aIntoB && (!bIntoA || countOf(a) <= countOf(b)) ? a : b;
    setMerging({ drop, into: drop === a ? b : a });
  };

  /**
   * Saves an edit. Widening to «both» is the existing documents updated first,
   * then the missing half created under the new name — in that order, so a
   * failure in between leaves a one-sided category with its new name rather
   * than two halves that no longer match and list as two categories.
   */
  const [runEdit, savingEdit] = useRunOnce();
  const saveEdit = (group: CategoryGroup, values: { name: string; icon: string; scope: CategoryScope }) =>
    runEdit(async () => {
      const fields = { name: values.name, icon: values.icon };
      const missing = typesToAdd(group.scope, values.scope);
      try {
        await updateCategory.mutateAsync({ categoryIds: group.members.map((m) => m.id), data: fields });
        for (const type of missing) await createCategory.mutateAsync({ name: fields.name, icon: fields.icon, scope: type });
      } catch {
        // Left open, as it was, to try again.
        toast.error(t("toasts.categorySaveFailed"));
        return;
      }
      celebrateSave({ collection: "categories", id: group.members[0]?.id });
      toast.success(t("toasts.categoryUpdated", { name: values.name }));
      setEditing(null);
    });

  const entries = (group: CategoryGroup): RowMenuEntry[] => [
    { label: t("common.edit"), icon: <FiEdit2 aria-hidden />, onSelect: () => setEditing(group) },
    { label: t("names.mergeInto"), icon: <FiGitMerge aria-hidden />, onSelect: () => setMerging({ drop: group }) },
    { label: t("common.delete"), icon: <FiTrash2 aria-hidden />, danger: true, onSelect: () => setDeleteTarget(group) },
  ];

  if (isLoading) return <SkeletonRows count={4} />;

  return (
    <>
      <p className={styles.intro}>{t("names.categoriesIntro")}</p>

      {/* The app's one «+» (`AddButton`) pinned left; the search takes the rest. */}
      <div className={styles.toolbar}>
        <AddButton small label={t("categories.new")} onClick={() => setCreating(true)} />
        <SearchInput value={query} onChange={setQuery} placeholder={t("names.categorySearch")} ariaLabel={t("names.categorySearch")} block />
      </div>
      <p className="text-body-secondary mb-3" style={{ fontSize: "var(--fs-small)" }}>
        {t("categories.builtInCount", { count: defaultCount })}
        {!hasOwn && ` · ${t("categories.noneYet")}`}
      </p>

      {!query.trim() && usageReady && (
        <SimilarPairs
          pairs={pairs}
          render={(g: CategoryGroup) => (
            <>
              {g.icon ?? "🧾"} {label(g)} <span className="text-body-secondary">({countOf(g)})</span>
            </>
          )}
          keyOf={groupKey}
          onMerge={mergePair}
        />
      )}

      {shown.length === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-text)" }}>
          {t("names.noMatch")}
        </p>
      ) : (
        <ul className={styles.list} aria-label={t("names.tabCategories")}>
          {shown.slice(0, limit).map((group) => {
            const own = group.members.every((m) => !m.isDefault);
            return (
              <li key={groupKey(group)} className={`${styles.row} ${group.members.map((m) => categoryFlash(m.id)).find(Boolean) ?? ""}`}>
                <span className={styles.icon} aria-hidden>
                  {group.icon ?? "🧾"}
                </span>
                <span className={styles.name}>{label(group)}</span>
                <Badge color={SCOPE_COLOR[group.scope]} pill style={{ fontSize: "var(--fs-caption)" }}>
                  {t(SCOPE_LABEL[group.scope])}
                </Badge>
                <span className={styles.meta}>
                  {usageReady ? t("names.records", { count: countOf(group) }) : "…"}
                  {!own && <span className="d-block">{t("names.builtInTag")}</span>}
                </span>
                {own ? <RowMenu label={t("names.rowActions", { name: label(group) })} entries={entries(group)} /> : <span className={styles.menuSpace} aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <>
          <div ref={sentinel} aria-hidden />
          <button type="button" className="btn btn-outline-secondary btn-sm w-100 mt-2" onClick={more}>
            {t("names.more", { count: shown.length - limit })}
          </button>
        </>
      )}

      {creating && (
        <CategoryModal
          existing={categories}
          scope="expense"
          isSaving={creatingNow}
          onClose={() => setCreating(false)}
          onUseExisting={(_category, name) => {
            setCreating(false);
            setQuery(name);
          }}
          onSubmit={(values) => void create(values)}
        />
      )}

      {editing && (
        <CategoryModal
          existing={categories}
          scope={editing.scope}
          category={editing}
          isSaving={savingEdit}
          onClose={() => setEditing(null)}
          onSubmit={(values) => void saveEdit(editing, values)}
        />
      )}

      {merging && (
        <CategoryMergeModal
          drop={merging.drop}
          into={merging.into}
          groups={groups}
          sources={stored}
          counts={counts}
          locked={deleteGuard.locked}
          lockReason={deleteGuard.reason}
          onClose={() => setMerging(null)}
          onMerge={merge}
        />
      )}

      <Modal isOpen={!!deleteTarget} toggle={closeDelete} backdrop={deleting ? "static" : true} keyboard={!deleting} centered>
        <ModalHeader toggle={deleting ? undefined : closeDelete}>{t("categories.deleteTitle")}</ModalHeader>
        <ModalBody>
          {usage === null ? (
            <Skeleton height={14} count={2} />
          ) : inUse ? (
            /* Refused rather than cascaded (item 28): deleting would leave those
               records with a category that no longer resolves. What should
               happen to them instead is still the owner's open question. */
            <Alert color="warning" className="mb-0" style={{ fontSize: "var(--fs-text)" }} data-testid="category-in-use">
              <p className="mb-1">{t("categories.deleteUsedBy", { name: deleteTarget ? label(deleteTarget) : "" })}</p>
              <ul className="mb-2 ps-3">
                {USAGE_KINDS.filter((kind) => usage[kind] > 0).map((kind) => (
                  <li key={kind}>{t(`categories.usage${kind[0].toUpperCase()}${kind.slice(1)}`, { count: usage[kind] })}</li>
                ))}
              </ul>
              <p className="mb-0">{t("categories.deleteUsedHint")}</p>
            </Alert>
          ) : (
            <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
              {t("categories.deleteConfirm", { name: deleteTarget ? label(deleteTarget) : "" })}
              {deleteTarget?.scope === "both" && <span className="d-block text-body-secondary mt-1" style={{ fontSize: "var(--fs-small)" }}>{t("categories.deleteBothNote")}</span>}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={closeDelete} disabled={deleting}>
            {inUse ? t("common.close") : t("common.cancel")}
          </Button>
          {!inUse && usage !== null && (
            <Button color="danger" onClick={() => void confirmDelete()} disabled={deleting || deleteGuard.locked} title={deleteGuard.reason} aria-busy={deleting || undefined}>
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
