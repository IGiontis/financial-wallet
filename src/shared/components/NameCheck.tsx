import { Alert, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { NameMatch } from "../utils/nameMatch";

/**
 * What a typed name meets, said under the field: the same name is refused —
 * «Υπάρχει ήδη: Δώρο» — and a similar one only suggested — «Μήπως εννοείς
 * «Δώρο»;». Either way one tap takes the one already there (`onUse`). Nothing
 * when the name is new. See `matchName`.
 *
 * `label` is the existing one as the reader knows it (a built-in category in
 * their language); `useLabel` words the button when taking it means more than
 * picking it — merging, on the names page.
 */
export function NameCheck({ match, label, onUse, useLabel }: { match: NameMatch<unknown>; label?: string; onUse?: () => void; useLabel?: string }) {
  const { t } = useTranslation();
  if (!match) return null;
  const name = label ?? match.name;
  const button = onUse && (
    <Button type="button" size="sm" color="secondary" outline className="flex-shrink-0" onClick={onUse}>
      {useLabel ?? t("names.useExisting", { name })}
    </Button>
  );

  if (match.kind === "same")
    return (
      <Alert color="warning" className="d-flex flex-wrap align-items-center gap-2 py-2 mt-2 mb-0" style={{ fontSize: "var(--fs-small)" }} role="alert" data-testid="name-exists">
        <span className="text-break" style={{ minWidth: 0, flex: "1 1 10rem" }}>
          {t("names.exists", { name })}
        </span>
        {button}
      </Alert>
    );

  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mt-2" style={{ fontSize: "var(--fs-small)" }} role="status" data-testid="name-similar">
      <span className="text-body-secondary text-break" style={{ minWidth: 0, flex: "1 1 10rem" }}>
        {t("names.didYouMean", { name })}
      </span>
      {button}
    </div>
  );
}

export default NameCheck;
