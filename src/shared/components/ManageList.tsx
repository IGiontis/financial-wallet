import { Badge } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import styles from "../css/ManageList.module.css";

export interface ManageItem {
  id: string;
  name: string;
  /** An emoji, the item's category or kind. */
  icon: string;
  /** When it comes, in words: «κάθε μήνα στις 12». */
  meta: string;
  /** Off in some way — paused, stopped, archived. Dims the row. */
  offTag?: string;
  /** Said of it without dimming it: «Μισθός». */
  tag?: string;
}

export interface ManageGroup {
  key: string;
  title: string;
  /** A Bootstrap colour name for the group's chip. */
  tone?: string;
  items: ManageItem[];
}

/**
 * «Διαχείριση»: what there is, and the two things done to it here — change one,
 * or delete it.
 *
 * No amounts and nothing to pay: the other pages are for the money. Each row
 * says only when it comes and whether it is off, so the whole set reads in one
 * look. The row itself opens the edit; the bin asks before deleting, as
 * everywhere else.
 */
export function ManageList({
  groups,
  hint,
  onEdit,
  onDelete,
  deleteLocked,
  deleteReason,
}: {
  groups: ManageGroup[];
  hint?: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="d-flex flex-column gap-3">
      {hint && <p className="small text-body-secondary mb-0">{hint}</p>}
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => {
          const tone = group.tone ?? "secondary";
          return (
            <section key={group.key} aria-label={group.title}>
              <Badge pill color={`${tone}-subtle`} className={`text-${tone}-emphasis border border-${tone}-subtle ${styles.chip}`}>
                {group.title} · {group.items.length}
              </Badge>
              <ul className={styles.list}>
                {group.items.map((item) => (
                  <li key={item.id} className={`${styles.row} ${item.offTag ? styles.rowOff : ""}`}>
                    <button type="button" className={styles.main} onClick={() => onEdit(item.id)} aria-label={t("manage.editName", { name: item.name })}>
                      <span className={styles.icon} aria-hidden>
                        {item.icon}
                      </span>
                      <span className={styles.text}>
                        <span className={styles.name}>
                          <span className={styles.nameText}>{item.name}</span>
                          {item.tag && <span className={`${styles.tag} ${styles.tagOn}`}>{item.tag}</span>}
                          {item.offTag && <span className={styles.tag}>{item.offTag}</span>}
                        </span>
                        <span className={styles.meta}>{item.meta}</span>
                      </span>
                    </button>
                    <button type="button" className={styles.btn} onClick={() => onEdit(item.id)} aria-label={t("manage.editName", { name: item.name })} title={t("manage.edit")}>
                      <FiEdit2 size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.delete}`}
                      onClick={() => onDelete(item.id)}
                      disabled={deleteLocked}
                      aria-label={t("manage.deleteName", { name: item.name })}
                      title={deleteLocked ? deleteReason : t("manage.delete")}
                    >
                      <FiTrash2 size={15} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}

export default ManageList;
