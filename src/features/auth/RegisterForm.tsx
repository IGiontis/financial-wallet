import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Row, Col, FormGroup, Label, Input, FormFeedback, Button, Alert, type InputProps } from "reactstrap";
import { useTranslation } from "react-i18next";
import { validationMessage } from "../../shared/utils/validationMessage";
import { LegalLinks } from "../legal/LegalLinks";
import { AgeTermsConsent } from "../legal/AgeTermsConsent";
import { appAuthActions, type AuthActions } from "./authActions";
import type { PendingSignUp } from "./pendingSignUp";
import { isInAppBrowser } from "./inAppBrowser";
import styles from "./css/Auth.module.css";

// ─── Validation ───────────────────────────────────────────────────────────────

// Messages are i18n keys ("key|count" for counted ones); FormFeedback
// translates them at render time through validationMessage.

const validationSchema = Yup.object({
  firstName: Yup.string().required("validation.nameRequired").max(50, "validation.maxChars|50"),
  lastName: Yup.string().required("validation.nameRequired").max(50, "validation.maxChars|50"),
  username: Yup.string()
    .required("validation.required")
    .min(3, "validation.minChars|3")
    .max(30, "validation.maxChars|30")
    .matches(/^[a-zA-Z0-9_]+$/, "validation.usernameFormat"),
  email: Yup.string().email("validation.emailInvalid").required("validation.emailRequired"),
  password: Yup.string().required("validation.passwordRequired").min(6, "validation.passwordMin"),
  confirmPassword: Yup.string().required("validation.required").oneOf([Yup.ref("password")], "validation.passwordsNoMatch"),
});

// ─── Firebase error messages ──────────────────────────────────────────────────
// Returns an i18n key so the message follows the selected language.

const getErrorKey = (code: string): string => {
  switch (code) {
    case "auth/email-already-in-use":
      return "errors.emailInUse";
    case "auth/invalid-email":
      return "validation.emailInvalid";
    case "auth/weak-password":
      return "errors.weakPassword";
    default:
      return "errors.generic";
  }
};

export interface RegisterFormProps {
  /** How it signs up: the app's own, unless the demo's dialog says otherwise. */
  actions?: AuthActions;
  /**
   * The account exists. `step` is the profile it still needs written — the
   * caller writes it (the page) or notes it for the real app (the demo's
   * dialog). A failure thrown here is shown on the form.
   */
  onSignedIn: (step: PendingSignUp) => Promise<void> | void;
  /** «Σύνδεση» in place, for the dialog; a link to /login otherwise. */
  onSwitch?: () => void;
  /** The page's own heading; the dialog has its title in its header instead. */
  showHeading?: boolean;
}

/**
 * The sign-up form: Google, or the details of a new account — and before
 * either, 18 or over and the terms accepted. Shared by /register and the
 * demo's dialog.
 */
export function RegisterForm({ actions = appAuthActions, onSignedIn, onSwitch, showHeading = true }: RegisterFormProps) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Ticked before either way of signing up goes ahead — see `AgeTermsConsent`.
  const [accepted, setAccepted] = useState(false);
  const [askedToAccept, setAskedToAccept] = useState(false);
  /** False, and the box marked, when it is not ticked yet. */
  const consentGiven = () => {
    if (!accepted) setAskedToAccept(true);
    return accepted;
  };
  const locale = () => i18n.resolvedLanguage ?? "en";

  const formik = useFormik({
    initialValues: {
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      setError(null);
      if (!consentGiven()) return;
      try {
        const user = await actions.registerWithEmail(values.email, values.password);
        await onSignedIn({
          kind: "profile",
          uid: user.uid,
          profile: { email: values.email, username: values.username, firstName: values.firstName, lastName: values.lastName, locale: locale() },
        });
      } catch (err) {
        setError(getErrorKey((err as { code?: string }).code ?? ""));
      }
    },
  });

  const handleGoogleRegister = async () => {
    setError(null);
    if (!consentGiven()) return;
    setGoogleLoading(true);
    try {
      const user = await actions.loginWithGoogle();
      // Someone who already has an account and taps Google here is signing in,
      // not starting over — the step writes a profile only where there is none.
      await onSignedIn({ kind: "google", uid: user.uid, email: user.email, displayName: user.displayName, locale: locale() });
    } catch (err) {
      setError(getErrorKey((err as { code?: string }).code ?? ""));
    } finally {
      setGoogleLoading(false);
    }
  };

  /** One labelled field, its id derived from its name so the label is tied to it. */
  const field = (name: keyof typeof formik.values, label: string, type: InputProps["type"], autoComplete: string, placeholder: string, className?: string) => (
    <FormGroup className={className}>
      <Label className="small fw-medium" for={`register-${name}`}>
        {label} *
      </Label>
      <Input
        id={`register-${name}`}
        type={type}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={formik.values[name]}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        invalid={!!(formik.touched[name] && formik.errors[name])}
      />
      <FormFeedback>{validationMessage(formik.errors[name], t)}</FormFeedback>
    </FormGroup>
  );

  return (
    <>
      {showHeading && <h1 className="h5 fw-semibold text-body-emphasis mb-1">{t("auth.createAccount")}</h1>}
      <p className="small text-body-secondary mb-4">{t("auth.createAccountSubtitle")}</p>

      {error && (
        <Alert color="danger" className="small py-2">
          {t(error)}
        </Alert>
      )}

      <AgeTermsConsent
        checked={accepted}
        invalid={askedToAccept && !accepted}
        onChange={(next) => {
          setAccepted(next);
          if (next) setAskedToAccept(false);
        }}
      />

      <Button
        type="button"
        className={`${styles.googleBtn} w-100`}
        onClick={handleGoogleRegister}
        disabled={googleLoading || formik.isSubmitting || isInAppBrowser}
        title={isInAppBrowser ? t("auth.openInBrowserForGoogle") : undefined}
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
        {googleLoading ? t("auth.signingUp") : t("auth.continueWithGoogle")}
      </Button>

      <div className={`${styles.divider} text-body-secondary small`}>{t("auth.or")}</div>

      <form onSubmit={formik.handleSubmit} noValidate>
        <Row>
          <Col xs={6}>{field("firstName", t("auth.firstName"), "text", "given-name", t("auth.firstNameExample"))}</Col>
          <Col xs={6}>{field("lastName", t("auth.lastName"), "text", "family-name", t("auth.lastNameExample"))}</Col>
        </Row>
        {field("username", t("auth.username"), "text", "username", t("auth.usernameExample"))}
        {field("email", t("auth.email"), "email", "email", t("auth.emailExample"))}
        <Row>
          <Col xs={12} sm={6}>
            {field("password", t("auth.password"), "password", "new-password", "••••••••")}
          </Col>
          <Col xs={12} sm={6}>
            {field("confirmPassword", t("auth.confirmPassword"), "password", "new-password", "••••••••", "mb-4")}
          </Col>
        </Row>

        <Button type="submit" color="primary" className="w-100" disabled={formik.isSubmitting || googleLoading}>
          {formik.isSubmitting ? t("auth.creatingAccount") : t("auth.createAccount")}
        </Button>
      </form>

      <p className="text-center small text-body-secondary mt-4 mb-0">
        {t("auth.haveAccount")}{" "}
        {onSwitch ? (
          <button type="button" className={`btn btn-link p-0 align-baseline small fw-medium text-decoration-none ${styles.switchLink}`} onClick={onSwitch}>
            {t("auth.signIn")}
          </button>
        ) : (
          <Link to="/login" className="fw-medium text-decoration-none">
            {t("auth.signIn")}
          </Link>
        )}
      </p>
      <p className="text-center mt-3 mb-0">
        <LegalLinks promise={false} />
      </p>
    </>
  );
}
