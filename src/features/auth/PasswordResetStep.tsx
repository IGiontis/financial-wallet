import { useEffect, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FormGroup, Label, Input, FormFeedback, Button, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { AuthActions } from "./authActions";
import { cooldownLeft, resetOutcome, startCooldown } from "./passwordReset";
import styles from "./css/Auth.module.css";
import { RequiredMark } from "../../shared/components/RequiredMark";

const validationSchema = Yup.object({
  email: Yup.string().trim().email("validation.emailInvalid").required("validation.emailRequired"),
});

export interface PasswordResetStepProps {
  actions: AuthActions;
  /** What the person had already typed in the sign-in form's email — their own value, carried over. */
  initialEmail: string;
  /** Back to the sign-in form, with the email as it stands here. */
  onBack: (email: string) => void;
  /** The page's own heading level; in the dialog its title sits in the header. */
  showHeading?: boolean;
}

/**
 * «Ξέχασα τον κωδικό»: the email, then Firebase sends a link for a new password.
 * What it says afterwards is the same whether or not there is such an account,
 * and always reminds a Google user that they have no password to reset.
 */
export function PasswordResetStep({ actions, initialEmail, onBack, showHeading = true }: PasswordResetStepProps) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(() => cooldownLeft());
  const emailRef = useRef<HTMLInputElement>(null);

  // The step replaced the link that opened it: the email field takes the focus.
  useEffect(() => emailRef.current?.focus(), []);

  // The countdown, read from the clock each second (a tab in the background
  // may tick late; the time left stays right).
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait(cooldownLeft()), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const formik = useFormik({
    initialValues: { email: initialEmail },
    validationSchema,
    // An error shows once the field was left or the form sent (`touched`), never while typing.
    onSubmit: async (values, helpers) => {
      if (cooldownLeft() > 0) return;
      setError(null);
      let failure: unknown = null;
      try {
        await actions.sendPasswordReset(values.email.trim());
      } catch (err) {
        failure = err;
      }
      const outcome = resetOutcome(failure);
      if (outcome.kind === "sent") {
        startCooldown();
        setWait(cooldownLeft());
        setSent(true);
      } else if (outcome.kind === "field") {
        helpers.setFieldError("email", outcome.key);
      } else {
        setError(outcome.key);
      }
    },
  });

  // After a send, any error; before it, only for an address typed and left — an
  // empty field left behind (on the way back to sign-in, say) stays quiet.
  const showFieldError = !!formik.errors.email && (formik.submitCount > 0 || (!!formik.touched.email && formik.values.email.trim() !== ""));
  const Heading = showHeading ? "h1" : "h3";
  const buttonText = formik.isSubmitting ? t("auth.reset.sending") : wait > 0 ? t("auth.reset.againIn", { count: wait }) : sent ? t("auth.reset.again") : t("auth.reset.send");

  return (
    <>
      <Heading className={`${showHeading ? "h5" : "h6"} fw-semibold text-body-emphasis mb-1`}>{t("auth.reset.title")}</Heading>
      <p className="small text-body-secondary mb-4">{t("auth.reset.intro")}</p>

      {error && (
        <Alert color="danger" className="small py-2">
          {t(error)}
        </Alert>
      )}

      {sent && (
        <div className={`${styles.notice} small py-2 px-3 mb-3`} role="status">
          <p className="mb-2">{t("auth.reset.sent")}</p>
          <p className="mb-0">{t("auth.reset.googleHint", { google: t("auth.continueWithGoogle") })}</p>
        </div>
      )}

      <form onSubmit={formik.handleSubmit} noValidate>
        <FormGroup className="mb-4">
          <Label className="small fw-medium" for="reset-email">
            {t("auth.email")}
            <RequiredMark />
          </Label>
          <Input
            id="reset-email"
            aria-required
            innerRef={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t("auth.emailExample")}
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            invalid={showFieldError}
          />
          <FormFeedback>{showFieldError && t(formik.errors.email!)}</FormFeedback>
        </FormGroup>

        <Button type="submit" color="primary" className="w-100" disabled={formik.isSubmitting || wait > 0}>
          {buttonText}
        </Button>
      </form>

      <p className="text-center small mt-4 mb-0">
        {/* The press must not take the focus from the field first: its error would push this link from under the finger. */}
        <button
          type="button"
          className={`btn btn-link p-0 align-baseline small fw-medium text-decoration-none ${styles.switchLink}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onBack(formik.values.email.trim())}
        >
          {t("auth.reset.back")}
        </button>
      </p>
    </>
  );
}
