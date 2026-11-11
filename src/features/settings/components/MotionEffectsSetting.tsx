import { useTranslation } from "react-i18next";
import { useMotionEffects } from "../../../shared/hooks/useMotionEffects";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../../../shared/css/ChoiceSwitch.module.css";

/**
 * «Κινούμενα εφέ: Ναι / Όχι» — on this device, applied as it is pressed, like
 * the theme beside it. Toggle buttons (`aria-pressed`), the theme switch's look.
 */
export function MotionEffectsSetting() {
  const { t } = useTranslation();
  const [on, setOn] = useMotionEffects();
  const options = [
    { value: true, label: t("common.yes") },
    { value: false, label: t("common.no") },
  ];
  return (
    <div role="group" aria-label={t("settings.motion")} className={`${segmented.group} ${segmented.even} ${styles.switch} w-100`}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={on === option.value}
          className={`${segmented.item} ${on === option.value ? segmented.active : ""} ${styles.option}`}
          onClick={() => setOn(option.value)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
