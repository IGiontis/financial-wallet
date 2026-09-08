import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";

import { DateField } from "../../../shared/components/DateField";
import { oneOffDate } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

export interface EntryDraft {
  id?: string;
  label: string;
  /** As typed, so an empty box stays empty instead of reading back as "0". */
  amount: string;
  /** "YYYY-MM-DD". Present only for dated extra pay. */
  date?: string;
  /** "YYYY-MM". A rate that only runs for part of the year. */
  from?: string;
  to?: string;
}

interface EntryEditorProps {
  /** A rate per month, or a single dated amount. */
  mode: "line" | "oneoff";
  draft: EntryDraft;
  /** Absent while creating. */
  onDelete?: () => void;
  onSave: (draft: EntryDraft) => void;
  onClose: () => void;
}

/**
 * One dialog for writing every figure the user owns.
 *
 * These used to be inline: a name box, an amount box, a suffix and a delete
 * cross squeezed onto one line under every row, permanently, whether or not
 * anyone was editing. On a phone that is four controls in about three hundred
 * pixels, and it made a list of three budget lines look like a form with nine
 * fields. It also meant the list could never be read — every row carried its
 * own editor whether you wanted it or not.
 *
 * A dialog costs one tap and gives each field a label, a sensible width, and a
 * delete that is not a 14-pixel cross beside two inputs.
 */
export function EntryEditor({ mode, draft, onDelete, onSave, onClose }: EntryEditorProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState<EntryDraft>(draft);

  const amount = parseFloat(value.amount);
  const dated = mode === "oneoff";
  // A Save that silently declines is indistinguishable from a Save that is
  // broken, so the button reads off this rather than the click doing nothing.
  // A season that ends before it starts charges nothing at all, which looks
  // like the app losing the entry rather than refusing it.
  const seasonBackwards = !!value.from && !!value.to && value.to < value.from;
  const valid = Number.isFinite(amount) && amount > 0 && (!dated || !!oneOffDate(value.date ?? "")) && !seasonBackwards;

  const save = () => valid && onSave({ ...value, label: value.label.trim() });

  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{t(draft.id ? "planner.editEntry" : dated ? "planner.addOneOff" : "planner.addEntry")}</span>
      </ModalHeader>

      <ModalBody className="pt-2" onKeyDown={(e) => e.key === "Enter" && save()}>
        <label className={styles.fieldLabel} htmlFor="entry-name">
          {t("planner.lineName")}
        </label>
        <Input
          id="entry-name"
          autoFocus
          value={value.label}
          onChange={(e) => setValue({ ...value, label: e.target.value })}
          placeholder={dated ? t("planner.oneOffNamePlaceholder") : t("planner.lineNamePlaceholder")}
          className="mb-3"
        />

        <label className={styles.fieldLabel} htmlFor="entry-amount">
          {dated ? t("planner.oneOffAmount") : t("planner.lineAmount")}
        </label>
        <Input
          id="entry-amount"
          type="number"
          min={0}
          inputMode="decimal"
          value={value.amount}
          onChange={(e) => setValue({ ...value, amount: e.target.value })}
          placeholder="0"
          className={dated ? "mb-3" : "mb-0"}
        />
        {!dated && <p className={styles.fieldHint}>{t("planner.perMonthHint")}</p>}

        {dated && (
          <>
            <label className={styles.fieldLabel} htmlFor="entry-date">
              {t("common.date")}
            </label>
            <DateField name="entry-date" value={value.date ?? ""} onChange={(v) => setValue({ ...value, date: v })} placeholder={t("common.date")} />
          </>
        )}

        {/* A rate that stops. "€200 a month for skiing, December to April" is
            not a bill and not a one-off — it is this line, with two ends. Left
            empty it runs for the whole window, which is what every line did
            before there was anywhere to put the ends. */}
        {!dated && (
          <div className="mt-3">
            <label className={styles.fieldLabel}>{t("planner.seasonLabel")}</label>
            {/* The app's own calendar, in month mode — not `input type="month"`,
                which is the native control DateField exists to replace. */}
            <div className="d-flex align-items-center gap-2">
              <DateField month clearable name="season-from" value={value.from ?? ""} onChange={(v) => setValue({ ...value, from: v })} placeholder={t("planner.seasonFrom")} />
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                {t("planner.seasonTo")}
              </span>
              <DateField month clearable name="season-to" value={value.to ?? ""} onChange={(v) => setValue({ ...value, to: v })} placeholder={t("planner.seasonToLabel")} />
            </div>
            {seasonBackwards ? <p className={styles.fieldError}>{t("planner.seasonBackwards")}</p> : <p className={styles.fieldHint}>{t("planner.seasonHint")}</p>}
          </div>
        )}
      </ModalBody>

      <ModalFooter className="justify-content-between">
        {/* Left, away from Save: the two buttons of a small dialog sitting side
            by side is how a delete gets pressed by accident. */}
        {onDelete ? (
          <Button color="link" className="text-danger px-0" onClick={onDelete}>
            {t("common.delete")}
          </Button>
        ) : (
          <span />
        )}
        <span className="d-flex gap-2">
          <Button color="secondary" outline onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={save} disabled={!valid}>
            {t("common.save")}
          </Button>
        </span>
      </ModalFooter>
    </Modal>
  );
}

export default EntryEditor;
