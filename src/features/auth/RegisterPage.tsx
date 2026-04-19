import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Container, Row, Col, Card, CardBody, FormGroup, Label, Input, FormFeedback, Button, Alert } from "reactstrap";
import { registerWithEmail, loginWithGoogle } from "../../firebase/auth";
import { createUser } from "../../firebase/firestore";

// ─── In-app browser detection ─────────────────────────────────────────────────

const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Messenger|LinkedIn/i.test(navigator.userAgent);

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  firstName: Yup.string().required("First name is required").max(50),
  lastName: Yup.string().required("Last name is required").max(50),
  username: Yup.string()
    .required("Username is required")
    .min(3, "Min 3 characters")
    .max(30, "Max 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores"),
  email: Yup.string().email("Enter a valid email").required("Email is required"),
  password: Yup.string().required("Password is required").min(6, "Min 6 characters"),
  confirmPassword: Yup.string()
    .required("Please confirm your password")
    .oneOf([Yup.ref("password")], "Passwords do not match"),
});

// ─── Firebase error messages ──────────────────────────────────────────────────

const getFriendlyError = (code: string): string => {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    default:
      return "Something went wrong. Please try again.";
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
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
      } catch (err: any) {
        setError(getFriendlyError(err.code));
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
    } catch (err: any) {
      if (err.code !== "firestore/already-exists") {
        setError(getFriendlyError(err.code));
      } else {
        navigate("/", { replace: true });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={7} lg={6} xl={5}>
            {/* Logo / brand */}
            <div style={styles.brand}>
              <p style={styles.brandIcon}>💳</p>
              <p style={styles.brandName}>MyFiWallet</p>
            </div>

            {/* In-app browser warning */}
            {isInAppBrowser && (
              <div
                style={{
                  background: "#FEF3C7",
                  border: "1px solid #F59E0B",
                  borderRadius: "var(--border-radius-md)",
                  padding: "12px 16px",
                  marginBottom: "1rem",
                  fontSize: 13,
                  color: "#92400E",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                For the best experience, open this link in <strong>Chrome</strong> or <strong>Safari</strong>. Google login may not work inside Messenger, Instagram or LinkedIn.
              </div>
            )}

            <Card style={styles.card}>
              <CardBody style={{ padding: "2rem" }}>
                <h5 style={styles.title}>Create your account</h5>
                <p style={styles.subtitle}>Start tracking your finances today</p>

                {error && (
                  <Alert color="danger" style={{ fontSize: 13 }}>
                    {error}
                  </Alert>
                )}

                {/* Google button */}
                <Button
                  type="button"
                  color="light"
                  block
                  onClick={handleGoogleRegister}
                  disabled={googleLoading || formik.isSubmitting || isInAppBrowser}
                  style={{
                    ...styles.googleBtn,
                    opacity: isInAppBrowser ? 0.5 : 1,
                    cursor: isInAppBrowser ? "not-allowed" : "pointer",
                  }}
                  title={isInAppBrowser ? "Open in Chrome or Safari to use Google login" : undefined}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: 18, marginRight: 8 }} />
                  {googleLoading ? "Signing up..." : "Continue with Google"}
                </Button>

                <div style={styles.divider}>
                  <span style={styles.dividerLine} />
                  <span style={styles.dividerText}>or</span>
                  <span style={styles.dividerLine} />
                </div>

                {/* Register form */}
                <form onSubmit={formik.handleSubmit} noValidate>
                  <Row>
                    <Col xs={6}>
                      <FormGroup>
                        <Label style={styles.label}>First name *</Label>
                        <Input
                          type="text"
                          name="firstName"
                          placeholder="John"
                          value={formik.values.firstName}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.firstName && formik.errors.firstName)}
                        />
                        <FormFeedback>{formik.errors.firstName}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={6}>
                      <FormGroup>
                        <Label style={styles.label}>Last name *</Label>
                        <Input
                          type="text"
                          name="lastName"
                          placeholder="Doe"
                          value={formik.values.lastName}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          invalid={!!(formik.touched.lastName && formik.errors.lastName)}
                        />
                        <FormFeedback>{formik.errors.lastName}</FormFeedback>
                      </FormGroup>
                    </Col>
                  </Row>

                  <FormGroup>
                    <Label style={styles.label}>Username *</Label>
                    <Input
                      type="text"
                      name="username"
                      placeholder="john_doe"
                      value={formik.values.username}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.username && formik.errors.username)}
                    />
                    <FormFeedback>{formik.errors.username}</FormFeedback>
                  </FormGroup>

                  <FormGroup>
                    <Label style={styles.label}>Email *</Label>
                    <Input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.email && formik.errors.email)}
                    />
                    <FormFeedback>{formik.errors.email}</FormFeedback>
                  </FormGroup>

                  <FormGroup>
                    <Label style={styles.label}>Password *</Label>
                    <Input
                      type="password"
                      name="password"
                      placeholder="••••••••"
                      value={formik.values.password}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.password && formik.errors.password)}
                    />
                    <FormFeedback>{formik.errors.password}</FormFeedback>
                  </FormGroup>

                  <FormGroup className="mb-4">
                    <Label style={styles.label}>Confirm password *</Label>
                    <Input
                      type="password"
                      name="confirmPassword"
                      placeholder="••••••••"
                      value={formik.values.confirmPassword}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      invalid={!!(formik.touched.confirmPassword && formik.errors.confirmPassword)}
                    />
                    <FormFeedback>{formik.errors.confirmPassword}</FormFeedback>
                  </FormGroup>

                  <Button type="submit" color="primary" block disabled={formik.isSubmitting || googleLoading}>
                    {formik.isSubmitting ? "Creating account..." : "Create account"}
                  </Button>
                </form>

                <p style={styles.footer}>
                  Already have an account?{" "}
                  <Link to="/login" style={styles.link}>
                    Sign in
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    background: "var(--color-background-primary, #f8f9fa)",
    padding: "2rem 0",
  },
  brand: {
    textAlign: "center",
    marginBottom: "1.5rem",
  },
  brandIcon: {
    fontSize: 40,
    margin: 0,
  },
  brandName: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    color: "var(--color-text-primary)",
  },
  card: {
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
  },
  title: {
    fontWeight: 600,
    margin: "0 0 4px",
    color: "var(--color-text-primary)",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    marginBottom: "1.5rem",
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    border: "1px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-md)",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "1.25rem 0",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "var(--color-border-tertiary)",
  },
  dividerText: {
    fontSize: 12,
    color: "var(--color-text-secondary)",
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
  },
  footer: {
    textAlign: "center",
    fontSize: 13,
    color: "var(--color-text-secondary)",
    marginTop: "1.25rem",
    marginBottom: 0,
  },
  link: {
    color: "var(--bs-primary)",
    textDecoration: "none",
    fontWeight: 500,
  },
};
