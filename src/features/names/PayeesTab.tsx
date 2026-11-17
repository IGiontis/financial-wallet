import { useMemo, useState } from "react";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiEdit2, FiGitMerge, FiTrash2 } from "react-icons/fi";
import { AddButton } from "../../shared/components/AddButton";
import { SearchInput } from "../../shared/components/SearchInput";
import { RowMenu, type RowMenuEntry } from "../../shared/components/RowMenu";
import { Skeleton } from "../../shared/components/Skeletons";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { useLoadMore } from "../../shared/hooks/useLoadMore";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { celebrateSave, useSavedFlash } from "../../shared/feedback/saveFeedback";
import { nameKey, similarPairs } from "../../shared/utils/nameMatch";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { usePayees } from "../transactions/hooks/usePayees";
import { payeeMatch } from "../transactions/payeeStore";
import { MatchedName } from "../transactions/components/PayeeInput";
import { linkedRecordIds, payeeRows, type PayeeRow } from "./payeeNames";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { PayeeNameModal, type PayeeModalMode, type PayeeRenameVars } from "./PayeeNameModal";
import { useRenamePayee } from "./useNameActions";
import { SimilarPairs } from "./SimilarPairs";
import styles from "./css/Names.module.css";
import segmented from "../../shared/css/Segmented.module.css";

/** Rows drawn at a time; the next ones arrive as the end comes into view. */
const PAGE = 40;

/** «Όλοι · Στις προτάσεις · Διπλοί» — which payees the grid shows. */
type PayeeFilter = "all" | "saved" | "duplicates";
const FILTERS: { id: PayeeFilter; label: string }[] = [
  { id: "all", label: "names.filterAll" },
  { id: "saved", label: "names.filterSaved" },
  { id: "duplicates", label: "names.filterDuplicates" },
];

interface Dialog {
  mode: PayeeModalMode;
  row?: PayeeRow;
  into?: PayeeRow;
}

/**
 * «Δικαιούχοι»: every payee — the saved ones the picker offers and every name
 * the records carry — with how many records carry it. Renaming one renames it
 * on all of them; two that are one can be merged. Counted from the lists the
 * app already holds: nothing is read to show this tab.
 */
export function PayeesTab() {
  const { t } = useTranslation();
  const transactions = useTransactions();
  const { payees, isReady, add, remove } = usePayees();
  const rename = useRenamePayee();
  const bulkGuard = useOfflineGuard("bulk");
  const deleteGuard = useOfflineGuard("delete");

  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [deleting, setDeleting] = useState<PayeeRow | null>(null);

  const records = useMemo(() => transactions.data ?? [], [transactions.data]);
  // Records named after what they are linked to — a bill, an income, a friend's
  // covered debt — are not payees (`carriesPayee`). Both lists are the cached,
  // delta-synced ones every money screen already holds.
  const bills = useBills();
  const debts = useDebts();
  const linked = useMemo(() => linkedRecordIds(bills.data ?? [], debts.data ?? [], records), [bills.data, debts.data, records]);
  const rows = useMemo(() => payeeRows(payees, records, linked), [payees, records, linked]);
  const found = useMemo(() => (query.trim() ? rows.filter((r) => payeeMatch(r.name, query)) : rows), [rows, query]);
  const pairs = useMemo(() => similarPairs(rows, (r) => [r.name]), [rows]);
  // «Διπλοί»: every name that sits in one of the «Πιθανά διπλά» pairs.
  const twins = useMemo(() => new Set(pairs.flatMap(([a, b]) => [a.key, b.key])), [pairs]);
  const [filter, setFilter] = useState<PayeeFilter>("all");
  const byFilter = useMemo(
    () => ({ all: found, saved: found.filter((r) => r.saved), duplicates: found.filter((r) => twins.has(r.key)) }),
    [found, twins],
  );
  const shown = byFilter[filter];
  const flashClass = useSavedFlash("payees", useMemo(() => rows.map((r) => r.key), [rows]));
  const { limit, hasMore, more, sentinel } = useLoadMore(shown.length, PAGE, `${filter}|${query}`);

  // The saved names are one list on the account: not before it has come, or a
  // name added would write over the ones already there.
  const openAdd = () => {
    if (isReady) setDialog({ mode: "add" });
  };
  usePageAdd(t("names.payeeAdd"), openAdd);

  // `isSuccess` turned false on a failed read and kept the skeleton for ever;
  // now a few seconds at most, then the page (`usePageLoad`). A list that has
  // come before and failed to refresh is shown as it was.
  const load = usePageLoad(!isReady || noAnswerYet(transactions, bills, debts));

  // A new name never waits for the server: on the list at once (`usePayees`
  // shows it before the write), the dialog closes with the toast; a refusal
  // later takes it off and says so.
  const onAdd = (name: string) => {
    add(name).catch(() => toast.error(t("names.saveFailed")));
    celebrateSave({ collection: "payees", id: nameKey(name) });
    toast.success(t("toasts.payeeAdded", { name }));
    setDialog(null);
    return Promise.resolve();
  };

  // Renaming on every record is online only: it waits for the answer, 7 s at
  // most (`answerOrLetGo`) — then the dialog lets go, the name and its records
  // stay disabled, and the toast comes with the answer.
  const onRename = (vars: PayeeRenameVars) => {
    const merging = dialog?.mode === "merge";
    const from = dialog && "row" in dialog ? dialog.row : undefined;
    return answerOrLetGo(() => rename.mutateAsync(vars), {
      records: [...(from ? [["payees", from.key] as const] : []), ...vars.ids.map((id) => ["transactions", id] as const)],
      close: () => setDialog(null),
      succeeded: () => {
        celebrateSave({ collection: "payees", id: nameKey(vars.to) });
        toast.success(t(merging ? "toasts.payeesMerged" : "toasts.payeeRenamed", { name: vars.to }));
      },
      failed: () => toast.error(t("names.saveFailed")),
    });
  };

  // Runs once; the dialog is locked until it answers — 7 s at most (`answerOrLetGo`).
  const [runDelete, busy] = useRunOnce();
  const confirmDelete = () =>
    runDelete(() => {
      if (!deleting) return;
      const row = deleting;
      return answerOrLetGo(() => remove(row.name), {
        records: [["payees", row.key]],
        close: () => setDeleting(null),
        succeeded: () => toast.success(t("toasts.payeeDeleted", { name: row.name })),
        failed: () => toast.error(t("names.saveFailed")),
      });
    });

  const entries = (row: PayeeRow): RowMenuEntry[] => [
    { label: t("names.rename"), icon: <FiEdit2 aria-hidden />, onSelect: () => setDialog({ mode: "rename", row }) },
    { label: t("names.mergeInto"), icon: <FiGitMerge aria-hidden />, onSelect: () => setDialog({ mode: "merge", row }), disabled: rows.length < 2 },
    // Only a saved name can leave the list; one the records carry stays theirs.
    ...(row.saved ? [{ label: t("common.delete"), icon: <FiTrash2 aria-hidden />, danger: true, onSelect: () => setDeleting(row) }] : []),
  ];

  return (
    <>
      <p className={styles.intro}>{t("names.payeesIntro")}</p>

      <div className={styles.toolbar}>
        <AddButton small label={t("names.payeeAdd")} onClick={openAdd} disabled={!isReady} />
        <SearchInput value={query} onChange={setQuery} placeholder={t("names.payeeSearch")} ariaLabel={t("names.payeeSearch")} block />
      </div>

      {load === "loading" ? (
        // Shaped like the grid that is coming.
        <div className={styles.grid} aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      ) : load === "waiting" ? (
        <PageWaiting />
      ) : (
        <>
          {!query.trim() && (
            <SimilarPairs
              pairs={pairs}
              render={(row: PayeeRow) => (
                <>
                  {row.name} <span className="text-body-secondary">({row.count})</span>
                </>
              )}
              keyOf={(row: PayeeRow) => row.key}
              // The one carried less goes into the one carried more.
              onMerge={([a, b]) => setDialog(a.count <= b.count ? { mode: "merge", row: a, into: b } : { mode: "merge", row: b, into: a })}
            />
          )}

          {rows.length > 0 && (
            <div className={`${segmented.group} ${styles.chips} mb-3`} role="group" aria-label={t("names.payeeFilter")}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  className={`${segmented.item} ${styles.chip} ${filter === f.id ? segmented.active : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {t(f.label)} <span className={styles.chipCount}>{byFilter[f.id].length}</span>
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-text)" }}>
              {query.trim() ? t("names.noMatch") : rows.length === 0 ? t("names.noPayees") : t("names.filterNone")}
            </p>
          ) : (
            <ul className={styles.grid} aria-label={t("names.tabPayees")}>
              {shown.slice(0, limit).map((row) => (
                // The name takes the card's whole width (a long one wraps at
                // its spaces, even two to a row at 320px), the count under it;
                // the ⋮ at the card's foot, beside «στις προτάσεις».
                <li key={row.key} className={`${styles.card} ${flashClass(row.key)}`}>
                  <span className={styles.cardBody}>
                    <span className={styles.name}>
                      <MatchedName name={row.name} query={query} />
                    </span>
                    <span className={styles.cardMeta}>{t("names.records", { count: row.count })}</span>
                  </span>
                  <span className={styles.cardFoot}>
                    {row.saved ? <span className={styles.savedMark}>{t("names.savedTag")}</span> : <span aria-hidden />}
                    <RowMenu label={t("names.rowActions", { name: row.name })} entries={entries(row)} />
                  </span>
                </li>
              ))}
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
        </>
      )}

      {dialog && (
        <PayeeNameModal
          mode={dialog.mode}
          row={dialog.row}
          into={dialog.into}
          rows={rows}
          transactions={records}
          linked={linked}
          saved={payees}
          locked={bulkGuard.locked}
          lockReason={bulkGuard.reason}
          onClose={() => setDialog(null)}
          onAdd={onAdd}
          onRename={onRename}
          onShow={(name) => {
            setDialog(null);
            setQuery(name);
          }}
        />
      )}

      <Modal isOpen={!!deleting} toggle={() => (busy ? undefined : setDeleting(null))} backdrop={busy ? "static" : true} keyboard={!busy} centered>
        <ModalHeader toggle={busy ? undefined : () => setDeleting(null)}>{t("names.payeeDeleteTitle")}</ModalHeader>
        <ModalBody style={{ fontSize: "var(--fs-lead)" }}>
          <p className="mb-1">{t("names.payeeDeleteConfirm", { name: deleting?.name ?? "" })}</p>
          {!!deleting?.count && (
            <p className="mb-0 text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
              {t("names.payeeDeleteKeeps", { count: deleting.count })}
            </p>
          )}
        </ModalBody>
        <ModalFooter className="justify-content-between">
          <Button color="secondary" outline onClick={() => setDeleting(null)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button color="danger" onClick={() => void confirmDelete()} disabled={busy || deleteGuard.locked} title={deleteGuard.reason}>
            {busy ? t("common.deleting") : t("common.delete")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default PayeesTab;
