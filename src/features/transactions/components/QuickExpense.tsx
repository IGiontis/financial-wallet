import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FiPlus } from "react-icons/fi";
import { useCategories, useCreateTransaction, useTransactions } from "../hooks/useTransactions";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { mainAccount } from "../../accounts/accountsUtils";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { categoryLabel, findCategory } from "../../../shared/utils/categories";
import { saveWithoutWaiting } from "../../../shared/utils/saveWithoutWaiting";
import { FORM_MODAL } from "../../../shared/components/formModal";
import { lastAccountFor, quickFavorites, recentCategoryIds, type QuickFavorite } from "../quickEntry";
import type { CreateTransactionDTO } from "../../../shared/types/IndexTypes";
import styles from "./css/QuickExpense.module.css";

/** The address the app icon's shortcut opens: any page, with this asking for the dialog. */
export const QUICK_EXPENSE_PARAM = "quick";

/**
 * A «+» on every page, for an expense put in as it is paid: amount, category,
 * card — «τα συνηθισμένα σου» on top, filling in all but the amount (and the
 * amount too, when it is always the same). The five-step form is still there
 * for anything with details; this is for the coffee and the supermarket.
 *
 * Also opened by the app icon's shortcut (`?quick=expense`).
 */
export function QuickExpense() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // From the shortcut on the app icon: open for as long as the address asks; closing takes the question off it.
  const fromShortcut = new URLSearchParams(search).get(QUICK_EXPENSE_PARAM) === "expense";
  const close = () => {
    setOpen(false);
    if (fromShortcut) navigate(pathname, { replace: true });
  };

  // Not over the full form, which is the same thing at length.
  const onFullForm = pathname.startsWith("/transactions/new");

  return (
    <>
      {!onFullForm && (
        <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-label={t("quick.open")} title={t("quick.open")} data-tour="quick-expense">
          <FiPlus aria-hidden />
        </button>
      )}
      {(open || fromShortcut) && <QuickExpenseDialog onClose={close} />}
    </>
  );
}

type When = "today" | "yesterday" | "other";

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function QuickExpenseDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const accounts = useAccountList();
  const main = mainAccount(accounts);
  const create = useCreateTransaction();
  const { convert, convertToBase, baseCurrency, displayCurrency, format } = useCurrencyConverter();
  const [now] = useState(() => new Date());

  const favorites = useMemo(() => quickFavorites(transactions, now), [transactions, now]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);
  const recent = useMemo(
    () =>
      recentCategoryIds(transactions)
        .map((id) => expenseCategories.find((c) => c.id === id))
        .filter((c) => c !== undefined),
    [transactions, expenseCategories],
  );

  const [amount, setAmount] = useState("");
  const [hint, setHint] = useState<number>();
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountPicked, setAccountPicked] = useState(false);
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [otherDay, setOtherDay] = useState(() => toInputDate(now));
  const amountRef = useRef<HTMLInputElement>(null);

  // Amounts are kept in the base currency and typed in the one on screen.
  const toScreen = (base: number) => (baseCurrency === displayCurrency ? base : convert(base));
  const shown = (base: number) => toScreen(base).toFixed(2).replace(".", ",");
  const typed = Number(amount.replace(/\s/g, "").replace(",", "."));
  const valid = typed > 0 && !!categoryId;

  const focusAmount = () => setTimeout(() => amountRef.current?.focus(), 0);

  const pickFavorite = (favorite: QuickFavorite) => {
    setDescription(favorite.label);
    setCategoryId(favorite.categoryId);
    setAccountId(favorite.accountId ?? "");
    setAccountPicked(true);
    // Filled in only when it is always the same; otherwise empty, with last time's as a hint.
    setAmount(favorite.fixedAmount !== undefined ? shown(favorite.fixedAmount) : "");
    setHint(favorite.fixedAmount !== undefined ? undefined : favorite.lastAmount);
    focusAmount();
  };

  const pickCategory = (id: string) => {
    setCategoryId(id);
    const category = expenseCategories.find((c) => c.id === id);
    // What the category itself was set to fill in, where nothing is there yet.
    if (!description && category?.defaultPayee) setDescription(category.defaultPayee);
    if (!amount && category?.defaultAmount) setAmount(shown(category.defaultAmount));
    if (!accountPicked) setAccountId(lastAccountFor(transactions, id) ?? "");
  };

  const date = () => {
    if (when === "today") return new Date();
    if (when === "yesterday") return new Date(Date.now() - 86_400_000);
    const [y, m, d] = otherDay.split("-").map(Number);
    const at = new Date();
    return new Date(y, m - 1, d, at.getHours(), at.getMinutes());
  };

  const save = () => {
    if (!valid) return;
    const category = findCategory(categories, categoryId);
    const name = (description.trim() || (category ? categoryLabel(category.name, t) : "")).slice(0, 30);
    const dto: CreateTransactionDTO = {
      amount: baseCurrency === displayCurrency ? typed : convertToBase(typed),
      type: "expense",
      categoryId,
      date: date(),
      description: name,
      accountId: accountId || undefined,
    };
    void saveWithoutWaiting(create, dto, () => toast.error(t("transactions.saveFailed")));
    toast.success(t("quick.saved", { amount: format(dto.amount), name }));
    onClose();
  };

  const chosenAccount = accountId || main?.id;
  const chosenOther = !!categoryId && !recent.some((c) => c.id === categoryId);

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable onOpened={() => amountRef.current?.focus()}>
      <ModalHeader toggle={onClose}>{t("quick.title")}</ModalHeader>
      <ModalBody>
        <form
          id="quick-expense"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {favorites.length > 0 && (
            <div className={styles.block}>
              <p className={styles.label}>{t("quick.favorites")}</p>
              <div className={styles.chips}>
                {favorites.map((favorite) => {
                  const category = findCategory(categories, favorite.categoryId);
                  const on = description === favorite.label && categoryId === favorite.categoryId;
                  return (
                    <button key={favorite.key} type="button" className={`${styles.chip} ${on ? styles.on : ""}`} aria-pressed={on} onClick={() => pickFavorite(favorite)}>
                      <span aria-hidden>{category?.icon ?? "•"}</span> {favorite.label}
                      {favorite.fixedAmount !== undefined && <span className={styles.chipAmount}>{format(favorite.fixedAmount)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.amountBox}>
            <input
              ref={amountRef}
              aria-label={t("quick.amount")}
              className={styles.amount}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
              placeholder={hint !== undefined ? t("quick.lastTime", { amount: format(hint) }) : "0,00"}
            />
            <span className={styles.currency} aria-hidden>
              {displayCurrency}
            </span>
          </div>

          <div className={styles.block}>
            <p className={styles.label}>{t("quick.category")}</p>
            <div className={styles.chips}>
              {recent.map((category) => (
                <button key={category.id} type="button" className={`${styles.chip} ${categoryId === category.id ? styles.on : ""}`} aria-pressed={categoryId === category.id} onClick={() => pickCategory(category.id)}>
                  <span aria-hidden>{category.icon ?? "•"}</span> {categoryLabel(category.name, t)}
                </button>
              ))}
              {/* Every other expense category, for one not used lately. */}
              <Input
                type="select"
                bsSize="sm"
                aria-label={t("quick.otherCategory")}
                className={`${styles.otherSelect} ${chosenOther ? styles.on : ""}`}
                value={chosenOther ? categoryId : ""}
                onChange={(event) => event.target.value && pickCategory(event.target.value)}
              >
                <option value="">{t("quick.otherCategory")}</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {categoryLabel(category.name, t)}
                  </option>
                ))}
              </Input>
            </div>
          </div>

          {accounts.length > 1 && (
            <div className={styles.block}>
              <p className={styles.label}>{t("quick.card")}</p>
              <div className={styles.chips}>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.chip} ${chosenAccount === account.id ? styles.on : ""}`}
                    aria-pressed={chosenAccount === account.id}
                    onClick={() => {
                      setAccountId(account.id === main?.id ? "" : account.id);
                      setAccountPicked(true);
                    }}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.row}>
            <Input bsSize="sm" value={description} maxLength={30} onChange={(event) => setDescription(event.target.value)} placeholder={t("quick.description")} aria-label={t("quick.description")} />
            <div className={styles.chips} role="group" aria-label={t("quick.when")}>
              {(["today", "yesterday", "other"] as const).map((option) => (
                <button key={option} type="button" className={`${styles.chip} ${when === option ? styles.on : ""}`} aria-pressed={when === option} onClick={() => setWhen(option)}>
                  {t(`quick.${option}`)}
                </button>
              ))}
            </div>
          </div>
          {when === "other" && <Input type="date" bsSize="sm" className="mt-2" value={otherDay} max={toInputDate(now)} onChange={(event) => setOtherDay(event.target.value)} aria-label={t("quick.when")} />}
        </form>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        {/* Anything with details — fuel, notes, a transfer — the full form. */}
        <Button
          color="link"
          className="px-0"
          onClick={() => {
            onClose();
            navigate("/transactions/new");
          }}
        >
          {t("quick.fullForm")}
        </Button>
        <Button color="primary" type="submit" form="quick-expense" disabled={!valid}>
          {t("common.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default QuickExpense;
