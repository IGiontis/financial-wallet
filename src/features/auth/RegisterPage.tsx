import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Container, Row, Col, Card, CardBody, FormGroup, Label, Input, FormFeedback, Button, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { registerWithEmail, loginWithGoogle } from "../../firebase/auth";
import { createUser } from "../../firebase/firestore";
import styles from "./css/Auth.module.css";

// ─── In-app browser detection ─────────────────────────────────────────────────

const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Messenger|LinkedIn/i.test(navigator.userAgent);

// ─── Validation ───────────────────────────────────────────────────────────────

// Messages are i18n keys; FormFeedback translates them at render time.

const validationSchema = Yup.object({
  firstName: Yup.string().required("validation.nameRequired").max(50),
  lastName: Yup.string().required("validation.nameRequired").max(50),
  username: Yup.string()
    .required("validation.required")
    .min(3, "validation.minChars")
    .max(30, "validation.maxChars")
    .matches(/^[a-zA-Z0-9_]+$/, "validation.required"),
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

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
      try {
        const firebaseUser = await registerWithEmail(values.email, values.password);
        await createUser(firebaseUser.uid, {
          email: values.email,
          username: values.username,
          firstName: values.firstName,
          lastName: values.lastName,
        });
        navigate("/", { replace: true });
      } catch (err) {
        setError(getErrorKey((err as { code?: string }).code ?? ""));
      }
    },
  });

  const handleGoogleRegister = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const firebaseUser = await loginWithGoogle();
      const displayName = firebaseUser.displayName ?? "";
      const [firstName = "", lastName = ""] = displayName.split(" ");

      await createUser(firebaseUser.uid, {
        email: firebaseUser.email ?? "",
        username: firebaseUser.uid.slice(0, 12),
        firstName,
        lastName,
      });

      navigate("/", { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== "firestore/already-exists") {
        setError(getErrorKey(code));
      } else {
        navigate("/", { replace: true });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={7} lg={6} xl={5}>
            {/* Brand */}
            <div className="text-center mb-4">
              <div className={`${styles.brandBadge} mx-auto mb-3`}>💳</div>
              <div className="fs-5 fw-semibold text-body-emphasis">MyFiWallet</div>
              <div className="small text-body-secondary">{t("auth.startTracking")}</div>
            </div>

            {isInAppBrowser && <div className={`${styles.inAppWarn} p-3 mb-3 text-center small`}>{t("auth.inAppBrowserWarning")}</div>}

            <Card className={styles.card}>
              <CardBody className="p-4 p-sm-5">
                <h1 className="h5 fw-semibold text-body-emphasis mb-1">{t("auth.createAccount")}</h1>
                <p className="small text-body-secondary mb-4">{t("auth.createAccountSubtitle")}</p>

                {error && (
                  <Alert color="danger" className="small py-2">
                    {t(error)}
                  </Alert>
                )}

                <Button
                  type="button"
                  className={`${styles.googleBtn} w-100`}
                  onClick={handleGoogleRegister}
                  disabled={googleLoading || formik.isSubmitting || isInAppBrowser}
                  title={isInAppBrowser ? "Open in Chrome or Safari to use Google login" : undefined}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
                  {googleLoading ? t("auth.signingUp") : t("auth.continueWithGoogle")}
                </Button>

                <div className={`${styles.divider} text-body-secondary small`}>{t("auth.or")}</div>

                <form onSubmit={formik.handleSubmit} noValidate>
                  <Row>
                    <Col xs={6}>
                      <FormGroup>
                        <Label className="small fw-medium">{t("auth.firstName")} *</Label>
                        <Input
                          type="text"
                          name="firstName"
                          autoComplete="given-name"
                          placeholder="John"
                          value={formik.values.firstName}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.firstName && formik.errors.firstName)}
                        />
                        <FormFeedback>{formik.errors.firstName && t(formik.errors.firstName)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={6}>
                      <FormGroup>
                        <Label className="small fw-medium">{t("auth.lastName")} *</Label>
                        <Input
                          type="text"
                          name="lastName"
                          autoComplete="family-name"
                          placeholder="Doe"
                          value={formik.values.lastName}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.lastName && formik.errors.lastName)}
                        />
                        <FormFeedback>{formik.errors.lastName && t(formik.errors.lastName)}</FormFeedback>
                      </FormGroup>
                    </Col>
                  </Row>

                  <FormGroup>
                    <Label className="small fw-medium">{t("auth.username")} *</Label>
                    <Input
                      type="text"
                      name="username"
                      autoComplete="username"
                      placeholder="john_doe"
                      value={formik.values.username}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.username && formik.errors.username)}
                    />
                    <FormFeedback>{formik.errors.username && t(formik.errors.username)}</FormFeedback>
                  </FormGroup>

                  <FormGroup>
                    <Label className="small fw-medium">{t("auth.email")} *</Label>
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

                  <Row>
                    <Col xs={12} sm={6}>
                      <FormGroup>
                        <Label className="small fw-medium">{t("auth.password")} *</Label>
                        <Input
                          type="password"
                          name="password"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={formik.values.password}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.password && formik.errors.password)}
                        />
                        <FormFeedback>{formik.errors.password && t(formik.errors.password)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} sm={6}>
                      <FormGroup className="mb-4">
                        <Label className="small fw-medium">{t("auth.confirmPassword")} *</Label>
                        <Input
                          type="password"
                          name="confirmPassword"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={formik.values.confirmPassword}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.confirmPassword && formik.errors.confirmPassword)}
                        />
                        <FormFeedback>{formik.errors.confirmPassword && t(formik.errors.confirmPassword)}</FormFeedback>
                      </FormGroup>
                    </Col>
                  </Row>

                  <Button type="submit" color="primary" className="w-100" disabled={formik.isSubmitting || googleLoading}>
                    {formik.isSubmitting ? t("auth.creatingAccount") : t("auth.createAccount")}
                  </Button>
                </form>

                <p className="text-center small text-body-secondary mt-4 mb-0">
                  {t("auth.haveAccount")}{" "}
                  <Link to="/login" className="fw-medium text-decoration-none">
                    {t("auth.signIn")}
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
