import { useState } from "react";
import { Alert, Button, Modal, ModalHeader, ModalBody, ModalFooter, Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { resetUserData, type ResetScope } from "../../../firebase/firestore";

/** Order shown in the dialog; every switch names exactly what it clears. */
const SCOPE_ITEMS: { key: keyof ResetScope; labelKey: string; hintKey: string }[] = [
  { key: "transactions", labelKey: "settings.resetTransactions", hintKey: "settings.resetTransactionsHint" },
  { key: "bills", labelKey: "settings.resetBills", hintKey: "settings.resetBillsHint" },
  { key: "goals", labelKey: "settings.resetGoals", hintKey: "settings.resetGoalsHint" },
  { key: "budgets", labelKey: "settings.resetBudgets", hintKey: "settings.resetBudgetsHint" },
  { key: "categories", labelKey: "settings.resetCategories", hintKey: "settings.resetCategoriesHint" },
];

const CONFIRM_WORD = "RESET";

/**
 * Starting over without starting again.
 *
 * Separate from deleting the account, and deliberately so: losing the thread of
 * what you've entered is a normal thing to do, and the fix for it shouldn't
 * cost you your login, your preferences, or the categories you built up. The
 * profile and the default categories are never in scope here, and the user's
 * own categories are opt-in rather than swept along.
 */
export default function ResetDataSection() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ResetScope>({ transactions: true, bills: true, goals: true, budgets: true, categories: false });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<number | null>(null);

  const anySelected = SCOPE_ITEMS.some((item) => scope[item.key]);
  // Typing the word is the brake. This cannot be undone and there is no export,
  // so a single click is too cheap for what it destroys.
  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  const close = () => {
    setOpen(false);
    setConfirmText("");
    setError("");
    setDeleted(null);
  };

  const run = async () => {
    if (!currentUser || !anySelected || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const count = await resetUserData(currentUser.uid, scope);
      // Everything on screen was built from what just went — drop the whole
      // cache rather than trying to name each affected key.
      await queryClient.invalidateQueries();
      setDeleted(count);
      setConfirmText("");
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-body-secondary" style={{ fontSize: 13 }}>
        {t("settings.resetBody")}
      </p>
      <Button color="warning" outline onClick={() => setOpen(true)}>
        {t("settings.resetAction")}
      </Button>

      <Modal isOpen={open} toggle={close} centered>
        <ModalHeader toggle={close}>{t("settings.resetTitle")}</ModalHeader>
        <ModalBody>
          {deleted !== null ? (
            <Alert color="success" className="mb-0" style={{ fontSize: 13 }}>
              {t("settings.resetDone", { count: deleted })}
            </Alert>
          ) : (
            <>
              <p style={{ fontSize: 13 }}>{t("settings.resetChoose")}</p>

              <div className="d-flex flex-column gap-2 mb-3">
                {SCOPE_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className="d-flex align-items-start gap-2 px-2 py-2"
                    style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}
                  >
                    <Input
                      type="checkbox"
                      className="mt-1 flex-shrink-0"
                      checked={!!scope[item.key]}
                      onChange={(e) => setScope((s) => ({ ...s, [item.key]: e.target.checked }))}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span className="d-block fw-medium" style={{ fontSize: 13 }}>
                        {t(item.labelKey)}
                      </span>
                      <span className="d-block text-body-secondary" style={{ fontSize: 11.5 }}>
                        {t(item.hintKey)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <Alert color="secondary" className="py-2" style={{ fontSize: 12 }}>
                {t("settings.resetKeeps")}
              </Alert>

              <Label className="small fw-medium">{t("settings.resetTypeToConfirm", { word: CONFIRM_WORD })}</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={CONFIRM_WORD} autoComplete="off" />

              {!anySelected && (
                <Alert color="warning" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  {t("settings.resetNothingSelected")}
                </Alert>
              )}
              {error && (
                <Alert color="danger" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  {error}
                </Alert>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={close} disabled={busy}>
            {deleted !== null ? t("common.close") : t("common.cancel")}
          </Button>
          {deleted === null && (
            <Button color="danger" onClick={run} disabled={busy || !anySelected || !confirmed}>
              {busy ? t("common.deleting") : t("settings.resetConfirmAction")}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
