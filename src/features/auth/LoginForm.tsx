import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FormGroup, Label, Input, FormFeedback, Button, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { RecaptchaNotice } from "../legal/RecaptchaNotice";
import { AgeTermsNotice } from "../legal/AgeTermsConsent";
import { appAuthActions, type AuthActions } from "./authActions";
import type { PendingSignUp } from "./pendingSignUp";
import { isInAppBrowser } from "./inAppBrowser";
import styles from "./css/Auth.module.css";

// ─── Validation ───────────────────────────────────────────────────────────────
// Messages are i18n keys; FormFeedback translates them at render time.

const validationSchema = Yup.object({
  email: Yup.string().email("validation.emailInvalid").required("validation.emailRequired"),
  password: Yup.string().required("validation.passwordRequired").min(6, "validation.passwordMin"),
});

// ─── Firebase error messages ──────────────────────────────────────────────────
// Returns an i18n key so the message follows the selected language.

const getErrorKey = (code: string): string => {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "errors.invalidCredentials";
    case "auth/too-many-requests":
      return "errors.tooManyRequests";
    case "auth/user-disabled":
      return "errors.accountDisabled";
    default:
      return "errors.generic";
  }
};

export interface LoginFormProps {
  /** How it signs in: the app's own, unless the demo's dialog says otherwise. */
  actions?: AuthActions;
  /**
   * Signed in. `step` is what a Google sign-in may still have to write (its
   * profile, the first time); the caller writes it or notes it, then moves on.
   * A failure thrown here is shown on the form like a sign-in's own.
   */
  onSignedIn: (step?: PendingSignUp) => Promise<void> | void;
  /** «Δημιούργησε έναν» in place, for the dialog; a link to /register otherwise. */
  onSwitch?: () => void;
  /** The page's own heading; the dialog has its title in its header instead. */
  showHeading?: boolean;
}

/**
 * The sign-in form: Google, or an email and a password. Shared by /login and
 * the demo's dialog, so the two never drift apart.
 */
export function LoginForm({ actions = appAuthActions, onSignedIn, onSwitch, showHeading = true }: LoginFormProps) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError(null);
      try {
        await actions.loginWithEmail(values.email, values.password);
        await onSignedIn();
      } catch (err) {
        setError(getErrorKey((err as { code?: string }).code ?? ""));
      }
    },
  });

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const user = await actions.loginWithGoogle();
      await onSignedIn({ kind: "google", uid: user.uid, email: user.email, displayName: user.displayName, locale: i18n.resolvedLanguage ?? "en" });
    } catch (err) {
      setError(getErrorKey((err as { code?: string }).code ?? ""));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <>
      {showHeading && <h1 className="h5 fw-semibold text-body-emphasis mb-1">{t("auth.welcomeBack")}</h1>}
      <p className="small text-body-secondary mb-4">{t("auth.signInToAccount")}</p>

      {error && (
        <Alert color="danger" className="small py-2">
          {t(error)}
        </Alert>
      )}

      <Button
        type="button"
        className={`${styles.googleBtn} w-100`}
        onClick={handleGoogleLogin}
        disabled={googleLoading || formik.isSubmitting || isInAppBrowser}
        title={isInAppBrowser ? t("auth.openInBrowserForGoogle") : undefined}
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
        {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
      </Button>

      <div className={`${styles.divider} text-body-secondary small`}>{t("auth.or")}</div>

      <form onSubmit={formik.handleSubmit} noValidate>
        <FormGroup>
          <Label className="small fw-medium" for="login-email">
            {t("auth.email")}
          </Label>
          <Input
            id="login-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t("auth.emailExample")}
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            invalid={!!(formik.touched.email && formik.errors.email)}
          />
          <FormFeedback>{formik.errors.email && t(formik.errors.email)}</FormFeedback>
        </FormGroup>

        <FormGroup className="mb-4">
          <Label className="small fw-medium" for="login-password">
            {t("auth.password")}
          </Label>
          <Input
            id="login-password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={formik.values.password}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            invalid={!!(formik.touched.password && formik.errors.password)}
          />
          <FormFeedback>{formik.errors.password && t(formik.errors.password)}</FormFeedback>
        </FormGroup>

        <Button type="submit" color="primary" className="w-100" disabled={formik.isSubmitting || googleLoading}>
          {formik.isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>

      <p className="text-center small text-body-secondary mt-4 mb-0">
        {t("auth.noAccount")}{" "}
        {onSwitch ? (
          <button type="button" className={`btn btn-link p-0 align-baseline small fw-medium text-decoration-none ${styles.switchLink}`} onClick={onSwitch}>
            {t("auth.createOne")}
          </button>
        ) : (
          <Link to="/register" className="fw-medium text-decoration-none">
            {t("auth.createOne")}
          </Link>
        )}
      </p>
      <AgeTermsNotice />
      <RecaptchaNotice className="text-center mt-3" />
    </>
  );
}
