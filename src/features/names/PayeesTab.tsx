import { useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiEdit2, FiGitMerge, FiTrash2 } from "react-icons/fi";
import { AddButton } from "../../shared/components/AddButton";
import { SearchInput } from "../../shared/components/SearchInput";
import { RowMenu, type RowMenuEntry } from "../../shared/components/RowMenu";
import { SkeletonRows } from "../../shared/components/Skeletons";
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

/** Rows drawn at a time; the next ones arrive as the end comes into view. */
const PAGE = 40;

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
  const [busy, setBusy] = useState(false);

  const records = useMemo(() => transactions.data ?? [], [transactions.data]);
  // Records named after what they are linked to — a bill, an income, a friend's
  // covered debt — are not payees (`carriesPayee`). Both lists are the cached,
  // delta-synced ones every money screen already holds.
  const bills = useBills();
  const debts = useDebts();
  const linked = useMemo(() => linkedRecordIds(bills.data ?? [], debts.data ?? [], records), [bills.data, debts.data, records]);
  const rows = useMemo(() => payeeRows(payees, records, linked), [payees, records, linked]);
  const shown = useMemo(() => (query.trim() ? rows.filter((r) => payeeMatch(r.name, query)) : rows), [rows, query]);
  const pairs = useMemo(() => similarPairs(rows, (r) => [r.name]), [rows]);
  const flashClass = useSavedFlash("payees", useMemo(() => rows.map((r) => r.key), [rows]));
  const { limit, hasMore, more, sentinel } = useLoadMore(shown.length, PAGE, query);

  const openAdd = () => setDialog({ mode: "add" });
  usePageAdd(t("names.payeeAdd"), openAdd);

  const ready = isReady && transactions.isSuccess && bills.isSuccess && debts.isSuccess;

  const onAdd = async (name: string) => {
    await add(name);
    celebrateSave({ collection: "payees", id: nameKey(name) });
    setDialog(null);
  };

  const onRename = async (vars: PayeeRenameVars) => {
    try {
      await rename.mutateAsync(vars);
    } catch (error) {
      toast.error(t("names.saveFailed"));
      throw error;
    }
    celebrateSave({ collection: "payees", id: nameKey(vars.to) });
    setDialog(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await remove(deleting.name);
      setDeleting(null);
    } catch {
      toast.error(t("names.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

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
        <AddButton small label={t("names.payeeAdd")} onClick={openAdd} disabled={!ready} />
        <SearchInput value={query} onChange={setQuery} placeholder={t("names.payeeSearch")} ariaLabel={t("names.payeeSearch")} block />
      </div>

      {!ready ? (
        <SkeletonRows count={6} />
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

          {shown.length === 0 ? (
            <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-text)" }}>
              {query.trim() ? t("names.noMatch") : t("names.noPayees")}
            </p>
          ) : (
            <ul className={styles.list} aria-label={t("names.tabPayees")}>
              {shown.slice(0, limit).map((row) => (
                <li key={row.key} className={`${styles.row} ${flashClass(row.key)}`}>
                  <span className={styles.name}>
                    <MatchedName name={row.name} query={query} />
                  </span>
                  <span className={styles.meta}>
                    {t("names.records", { count: row.count })}
                    {row.saved && <span className="d-block">{t("names.savedTag")}</span>}
                  </span>
                  <RowMenu label={t("names.rowActions", { name: row.name })} entries={entries(row)} />
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

      <Modal isOpen={!!deleting} toggle={() => setDeleting(null)} centered>
        <ModalHeader toggle={() => setDeleting(null)}>{t("names.payeeDeleteTitle")}</ModalHeader>
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
