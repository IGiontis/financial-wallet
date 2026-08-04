import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Container, Row, Col, Card, CardBody, FormGroup, Label, Input, FormFeedback, Button, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { loginWithEmail, loginWithGoogle } from "../../firebase/auth";
import { createUser, getUser } from "../../firebase/firestore";
import styles from "./css/Auth.module.css";

// ─── In-app browser detection ─────────────────────────────────────────────────

const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Messenger|LinkedIn/i.test(navigator.userAgent);

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema,
    onSubmit: async (values) => {
      setError(null);
      try {
        await loginWithEmail(values.email, values.password);
        navigate(from, { replace: true });
      } catch (err) {
        setError(getErrorKey((err as { code?: string }).code ?? ""));
      }
    },
  });

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const firebaseUser = await loginWithGoogle();

      // Check if Firestore document exists — if not, create it
      const existing = await getUser(firebaseUser.uid);
      if (!existing) {
        const displayName = firebaseUser.displayName ?? "";
        const [firstName = "", lastName = ""] = displayName.split(" ");
        await createUser(firebaseUser.uid, {
          email: firebaseUser.email ?? "",
          username: firebaseUser.uid.slice(0, 12),
          firstName,
          lastName,
        });
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorKey((err as { code?: string }).code ?? ""));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={7} lg={5} xl={4}>
            {/* Brand */}
            <div className="text-center mb-4">
              <div className={`${styles.brandBadge} mx-auto mb-3`}>💳</div>
              <div className="fs-5 fw-semibold text-body-emphasis">MyFiWallet</div>
              <div className="small text-body-secondary">{t("auth.tagline")}</div>
            </div>

            {isInAppBrowser && <div className={`${styles.inAppWarn} p-3 mb-3 text-center small`}>{t("auth.inAppBrowserWarning")}</div>}

            <Card className={styles.card}>
              <CardBody className="p-4 p-sm-5">
                <h1 className="h5 fw-semibold text-body-emphasis mb-1">{t("auth.welcomeBack")}</h1>
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
                  title={isInAppBrowser ? "Open in Chrome or Safari to use Google login" : undefined}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
                  {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
                </Button>

                <div className={`${styles.divider} text-body-secondary small`}>{t("auth.or")}</div>

                <form onSubmit={formik.handleSubmit} noValidate>
                  <FormGroup>
                    <Label className="small fw-medium">{t("auth.email")}</Label>
                    <Input
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.email && formik.errors.email)}
                    />
                    <FormFeedback>{formik.errors.email && t(formik.errors.email)}</FormFeedback>
                  </FormGroup>

                  <FormGroup className="mb-4">
                    <Label className="small fw-medium">{t("auth.password")}</Label>
                    <Input
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
                  <Link to="/register" className="fw-medium text-decoration-none">
                    {t("auth.createOne")}
                  </Link>
                </p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
