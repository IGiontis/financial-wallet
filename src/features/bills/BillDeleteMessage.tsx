import { useTranslation } from "react-i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

/**
 * What the delete dialog says about a bill: the question, and — when it has
 * any — how many of its payments go with it. The expenses they wrote stay in
 * Transactions (see `deleteBill`).
 *
 * Counted from the bills on screen. The delete itself asks the server which
 * payments are there, so a payment synced late is still taken; the figure
 * here is the one the reader can check against the bill's history.
 */
export default function BillDeleteMessage({ bill }: { bill: Pick<BillWithStatus, "name" | "payments"> }) {
  const { t } = useTranslation();
  const count = bill.payments.length;
  return (
    <>
      <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
        {t("bills.deleteAsk", { name: bill.name })}
      </p>
      {count > 0 && (
        <p className="mb-0 mt-2" style={{ fontSize: "var(--fs-text)" }}>
          {t("bills.deletePayments", { count })}
        </p>
      )}
    </>
  );
}
