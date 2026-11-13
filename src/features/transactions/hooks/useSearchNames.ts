import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceSetting } from "../../../shared/hooks/useWorkspaceSetting";
import { SUPPORTED_LANGUAGES } from "../../../i18n";
import { BUSINESSES_KEY } from "../../business/businessKeys";
import { readBusinesses } from "../../business/businessEdit";
import { buildSearchNames, type SearchNames } from "../transactionFilter";

/**
 * The names a record answers to in the search, in every language the app
 * speaks: «Δουλειά» and «Business» both find a closing's record, whatever the
 * screen's language. The businesses come from the user document — no read.
 */
export function useSearchNames(): SearchNames {
  const { i18n } = useTranslation();
  const [stored] = useWorkspaceSetting<unknown>(BUSINESSES_KEY, []);
  return useMemo(() => buildSearchNames(SUPPORTED_LANGUAGES.map((l) => i18n.getFixedT(l.code)), readBusinesses(stored)), [i18n, stored]);
}
