import { useTranslation } from "react-i18next";
import { ViewSwitch } from "./ViewSwitch";
import { DENSITIES, type Density } from "../hooks/useDensity";

const LABEL: Record<Density, string> = {
  simple: "common.densitySimple",
  normal: "common.densityNormal",
  detailed: "common.densityDetailed",
};

/**
 * «Απλό · Κανονικό · Αναλυτικό» — how much each row of a list says. The same
 * rows, more or less of each: so it is the in-page view switch (`ViewSwitch`),
 * with these three words on every page that has it. Keep the choice with
 * `useDensity(pageKey)`:
 *
 *   const [density, setDensity] = useDensity("debts-person");
 *   <DensitySwitch value={density} onChange={setDensity} />
 *
 * Reference: `features/debts/DebtPersonPage.tsx`.
 */
export function DensitySwitch({ value, onChange, className }: { value: Density; onChange: (next: Density) => void; className?: string }) {
  const { t } = useTranslation();
  return <ViewSwitch label={t("common.density")} value={value} onChange={onChange} className={className} options={DENSITIES.map((id) => ({ id, label: t(LABEL[id]) }))} />;
}

export default DensitySwitch;
