import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Container, Row, Col, Card, CardBody, FormGroup, Label, Input, FormFeedback, Button, Modal, ModalHeader, ModalBody, ModalFooter, Spinner, Alert } from "reactstrap";
import { useAuth } from "../../../context/AuthContext";
import { getUser, updateUser } from "../../../firebase/firestore";
import { updateUserEmail, updateUserPassword, reauthenticate, deleteAccount, isGoogleUser, logout } from "../../../firebase/auth";
import { exchangeRateKeys } from "../../../shared/hooks/useCurrencyConverter";
import type { User, UpdateUserDTO } from "../../../shared/types/IndexTypes";
import { useQueryClient } from "@tanstack/react-query";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
];

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "el-GR", label: "Greek (Ελληνικά)" },
  { value: "de-DE", label: "German (Deutsch)" },
  { value: "fr-FR", label: "French (Français)" },
  { value: "es-ES", label: "Spanish (Español)" },
];

const COUNTRIES = ["Greece", "United States", "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "Portugal", "Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (first: string, last: string) => `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

const getFriendlyError = (code: string): string => {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Current password is incorrect.";
    case "auth/email-already-in-use":
      return "This email is already in use.";
    case "auth/weak-password":
      return "New password must be at least 6 characters.";
    case "auth/requires-recent-login":
      return "Please log out and log back in before making this change.";
    default:
      return "Something went wrong. Please try again.";
  }
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", marginBottom: "1rem" }}>
      <CardBody style={{ padding: "1.5rem" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ fontWeight: 500, fontSize: 15, margin: 0, color: "var(--color-text-primary)" }}>{title}</p>
          {subtitle && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>{subtitle}</p>}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const googleUser = isGoogleUser();
  const queryClient = useQueryClient();

  const [userData, setUserData] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    getUser(currentUser.uid)
      .then((u) => setUserData(u))
      .finally(() => setLoadingUser(false));
  }, [currentUser]);

  // ── Profile form (email/password users only) ───────────────────────────────

  const profileForm = useFormik({
    enableReinitialize: true,
    initialValues: {
      firstName: userData?.firstName ?? "",
      lastName: userData?.lastName ?? "",
      displayName: userData?.displayName ?? "",
      username: userData?.username ?? "",
      age: userData?.age ?? "",
      city: userData?.city ?? "",
      country: userData?.country ?? "",
    },
    validationSchema: Yup.object({
      firstName: Yup.string().required("First name is required").max(50),
      lastName: Yup.string().required("Last name is required").max(50),
      displayName: Yup.string().max(50),
      username: Yup.string()
        .required("Username is required")
        .min(3)
        .max(30)
        .matches(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores"),
      age: Yup.number().typeError("Must be a number").min(13).max(120).optional(),
      city: Yup.string().max(100),
      country: Yup.string().max(100),
    }),
    onSubmit: async (values) => {
      try {
        const data: UpdateUserDTO = {
          firstName: values.firstName,
          lastName: values.lastName,
          displayName: values.displayName || undefined,
          username: values.username,
          age: values.age ? Number(values.age) : undefined,
          city: values.city || undefined,
          country: values.country || undefined,
        };
        await updateUser(currentUser!.uid, data);

        // Update the cache immediately so Topbar re-renders without refresh
        queryClient.setQueryData(exchangeRateKeys.user(currentUser!.uid), (old: any) => ({ ...old, ...data }));
        queryClient.invalidateQueries({
          queryKey: exchangeRateKeys.user(currentUser!.uid),
        });

        toast.success("Profile updated successfully!");
      } catch {
        toast.error("Failed to update profile.");
      }
    },
  });

  // ── Preferences form ───────────────────────────────────────────────────────

  const prefsForm = useFormik({
    enableReinitialize: true,
    initialValues: {
      currency: userData?.currency ?? "EUR",
      locale: userData?.locale ?? "en-US",
    },
    validationSchema: Yup.object({
      currency: Yup.string().oneOf(["USD", "EUR", "GBP"]).required(),
      locale: Yup.string().required(),
    }),
    onSubmit: async (values) => {
      try {
        await updateUser(currentUser!.uid, {
          currency: values.currency as "USD" | "EUR" | "GBP",
        });
        queryClient.setQueryData(exchangeRateKeys.user(currentUser!.uid), (old: any) => ({ ...old, currency: values.currency }));
        queryClient.invalidateQueries({ queryKey: exchangeRateKeys.user(currentUser!.uid) });
        toast.success("Preferences saved!");
      } catch {
        toast.error("Failed to save preferences.");
      }
    },
  });

  // ── Email form ─────────────────────────────────────────────────────────────

  const emailForm = useFormik({
    initialValues: { newEmail: "", currentPassword: "" },
    validationSchema: Yup.object({
      newEmail: Yup.string().email("Enter a valid email").required("Email is required"),
      currentPassword: Yup.string().required("Current password is required"),
    }),
    onSubmit: async (values, { resetForm }) => {
      try {
        await reauthenticate(values.currentPassword);
        await updateUserEmail(values.newEmail);
        await updateUser(currentUser!.uid, {});
        toast.success("Email updated successfully!");
        resetForm();
      } catch (err: any) {
        toast.error(getFriendlyError(err.code));
      }
    },
  });

  // ── Password form ──────────────────────────────────────────────────────────

  const passwordForm = useFormik({
    initialValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validationSchema: Yup.object({
      currentPassword: Yup.string().required("Current password is required"),
      newPassword: Yup.string().required("New password is required").min(6, "Min 6 characters"),
      confirmPassword: Yup.string()
        .required("Please confirm your password")
        .oneOf([Yup.ref("newPassword")], "Passwords do not match"),
    }),
    onSubmit: async (values, { resetForm }) => {
      try {
        await reauthenticate(values.currentPassword);
        await updateUserPassword(values.newPassword);
        toast.success("Password changed successfully!");
        resetForm();
      } catch (err: any) {
        toast.error(getFriendlyError(err.code));
      }
    },
  });

  // ── Delete account ─────────────────────────────────────────────────────────

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      if (!googleUser) await reauthenticate(deletePassword);
      await deleteAccount();
      await logout();
      navigate("/login", { replace: true });
    } catch (err: any) {
      setDeleteError(getFriendlyError(err.code));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingUser) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  const initials = getInitials(userData?.firstName ?? currentUser?.displayName?.split(" ")[0] ?? "", userData?.lastName ?? currentUser?.displayName?.split(" ")[1] ?? "");

  return (
    <Container fluid className="py-4" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Settings</h5>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Manage your profile, preferences and account security</p>
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <Section title="Profile" subtitle="Your personal information">
        {/* Avatar row */}
        <div className="d-flex align-items-center gap-3 mb-4">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 600,
              color: "#ffffff",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{userData?.firstName ? `${userData.firstName} ${userData.lastName}` : (currentUser?.displayName ?? "—")}</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>{currentUser?.email}</p>
          </div>
        </div>

        {/* Google users — read only message */}
        {googleUser ? (
          <div
            style={{
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "1rem",
              fontSize: 13,
              color: "var(--color-text-secondary)",
            }}
          >
            Your profile information is managed through your Google account. To update your name or photo, change them in your Google account settings.
          </div>
        ) : (
          /* Email/password users — editable form */
          <form onSubmit={profileForm.handleSubmit} noValidate>
            <Row className="g-3">
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>First name *</Label>
                  <Input
                    type="text"
                    name="firstName"
                    value={profileForm.values.firstName}
                    onChange={profileForm.handleChange}
                    onBlur={profileForm.handleBlur}
                    invalid={!!(profileForm.touched.firstName && profileForm.errors.firstName)}
                  />
                  <FormFeedback>{profileForm.errors.firstName}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Last name *</Label>
                  <Input
                    type="text"
                    name="lastName"
                    value={profileForm.values.lastName}
                    onChange={profileForm.handleChange}
                    onBlur={profileForm.handleBlur}
                    invalid={!!(profileForm.touched.lastName && profileForm.errors.lastName)}
                  />
                  <FormFeedback>{profileForm.errors.lastName}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Username *</Label>
                  <Input
                    type="text"
                    name="username"
                    value={profileForm.values.username}
                    onChange={profileForm.handleChange}
                    onBlur={profileForm.handleBlur}
                    invalid={!!(profileForm.touched.username && profileForm.errors.username)}
                  />
                  <FormFeedback>{profileForm.errors.username}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>
                    Display name <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                  </Label>
                  <Input
                    type="text"
                    name="displayName"
                    placeholder="How you want to appear in the app"
                    value={profileForm.values.displayName}
                    onChange={profileForm.handleChange}
                    onBlur={profileForm.handleBlur}
                  />
                </FormGroup>
              </Col>
              <Col xs={12} md={4}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>
                    Age <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                  </Label>
                  <Input
                    type="number"
                    name="age"
                    min={13}
                    max={120}
                    value={profileForm.values.age}
                    onChange={profileForm.handleChange}
                    onBlur={profileForm.handleBlur}
                    invalid={!!(profileForm.touched.age && profileForm.errors.age)}
                  />
                  <FormFeedback>{profileForm.errors.age}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={4}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>
                    City <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                  </Label>
                  <Input type="text" name="city" value={profileForm.values.city} onChange={profileForm.handleChange} onBlur={profileForm.handleBlur} />
                </FormGroup>
              </Col>
              <Col xs={12} md={4}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>
                    Country <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
                  </Label>
                  <Input type="select" name="country" value={profileForm.values.country} onChange={profileForm.handleChange}>
                    <option value="">Select country...</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
            </Row>
            <div className="d-flex justify-content-end mt-4">
              <Button type="submit" color="primary" disabled={profileForm.isSubmitting || !profileForm.dirty}>
                {profileForm.isSubmitting ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        )}
      </Section>

      {/* ── Preferences ─────────────────────────────────────────────────────── */}
      <Section title="Preferences" subtitle="Currency and language settings">
        <form onSubmit={prefsForm.handleSubmit} noValidate>
          <Row className="g-3">
            <Col xs={12} md={6}>
              <FormGroup className="mb-0">
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Currency</Label>
                <Input type="select" name="currency" value={prefsForm.values.currency} onChange={prefsForm.handleChange}>
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col xs={12} md={6}>
              <FormGroup className="mb-0">
                <Label style={{ fontSize: 13, fontWeight: 500 }}>Language <small className="text-muted">(Coming Soon)</small></Label>
                <Input type="select" name="locale" value={prefsForm.values.locale} onChange={prefsForm.handleChange} disabled>
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <div className="d-flex justify-content-end mt-4">
            <Button type="submit" color="primary" disabled={prefsForm.isSubmitting || !prefsForm.dirty}>
              {prefsForm.isSubmitting ? "Saving..." : "Save preferences"}
            </Button>
          </div>
        </form>
      </Section>

      {/* ── Email (email/password users only) ───────────────────────────────── */}
      {!googleUser && (
        <Section title="Email address" subtitle="Change the email associated with your account">
          <form onSubmit={emailForm.handleSubmit} noValidate>
            <Row className="g-3">
              <Col xs={12}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Current email</Label>
                  <Input type="text" value={currentUser?.email ?? ""} disabled style={{ background: "var(--color-background-secondary)" }} />
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>New email *</Label>
                  <Input
                    type="email"
                    name="newEmail"
                    value={emailForm.values.newEmail}
                    onChange={emailForm.handleChange}
                    onBlur={emailForm.handleBlur}
                    invalid={!!(emailForm.touched.newEmail && emailForm.errors.newEmail)}
                  />
                  <FormFeedback>{emailForm.errors.newEmail}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Current password *</Label>
                  <Input
                    type="password"
                    name="currentPassword"
                    placeholder="Required to confirm"
                    value={emailForm.values.currentPassword}
                    onChange={emailForm.handleChange}
                    onBlur={emailForm.handleBlur}
                    invalid={!!(emailForm.touched.currentPassword && emailForm.errors.currentPassword)}
                  />
                  <FormFeedback>{emailForm.errors.currentPassword}</FormFeedback>
                </FormGroup>
              </Col>
            </Row>
            <div className="d-flex justify-content-end mt-4">
              <Button type="submit" color="primary" disabled={emailForm.isSubmitting || !emailForm.dirty}>
                {emailForm.isSubmitting ? "Updating..." : "Update email"}
              </Button>
            </div>
          </form>
        </Section>
      )}

      {/* ── Password (email/password users only) ─────────────────────────────── */}
      {!googleUser && (
        <Section title="Change password" subtitle="Use a strong password of at least 6 characters">
          <form onSubmit={passwordForm.handleSubmit} noValidate>
            <Row className="g-3">
              <Col xs={12}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Current password *</Label>
                  <Input
                    type="password"
                    name="currentPassword"
                    value={passwordForm.values.currentPassword}
                    onChange={passwordForm.handleChange}
                    onBlur={passwordForm.handleBlur}
                    invalid={!!(passwordForm.touched.currentPassword && passwordForm.errors.currentPassword)}
                  />
                  <FormFeedback>{passwordForm.errors.currentPassword}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>New password *</Label>
                  <Input
                    type="password"
                    name="newPassword"
                    value={passwordForm.values.newPassword}
                    onChange={passwordForm.handleChange}
                    onBlur={passwordForm.handleBlur}
                    invalid={!!(passwordForm.touched.newPassword && passwordForm.errors.newPassword)}
                  />
                  <FormFeedback>{passwordForm.errors.newPassword}</FormFeedback>
                </FormGroup>
              </Col>
              <Col xs={12} md={6}>
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 13, fontWeight: 500 }}>Confirm new password *</Label>
                  <Input
                    type="password"
                    name="confirmPassword"
                    value={passwordForm.values.confirmPassword}
                    onChange={passwordForm.handleChange}
                    onBlur={passwordForm.handleBlur}
                    invalid={!!(passwordForm.touched.confirmPassword && passwordForm.errors.confirmPassword)}
                  />
                  <FormFeedback>{passwordForm.errors.confirmPassword}</FormFeedback>
                </FormGroup>
              </Col>
            </Row>
            <div className="d-flex justify-content-end mt-4">
              <Button type="submit" color="primary" disabled={passwordForm.isSubmitting || !passwordForm.dirty}>
                {passwordForm.isSubmitting ? "Changing..." : "Change password"}
              </Button>
            </div>
          </form>
        </Section>
      )}

      {/* ── Account security (Google users) ─────────────────────────────────── */}
      {googleUser && (
        <Section title="Account security" subtitle="Your account is managed by Google">
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
            You signed in with Google. Email and password changes are managed through your Google account.
          </p>
        </Section>
      )}

      {/* ── Danger zone ─────────────────────────────────────────────────────── */}
      <Card style={{ border: "0.5px solid var(--bs-danger)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", marginBottom: "1rem" }}>
        <CardBody style={{ padding: "1.5rem" }}>
          <p style={{ fontWeight: 500, fontSize: 15, margin: "0 0 4px", color: "var(--bs-danger)" }}>Danger zone</p>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
            Once you delete your account all your data — transactions, goals and categories — will be permanently removed. This cannot be undone.
          </p>
          <Button color="danger" outline onClick={() => setShowDeleteModal(true)}>
            Delete account
          </Button>
        </CardBody>
      </Card>

      {/* ── Delete account modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={showDeleteModal}
        toggle={() => {
          setShowDeleteModal(false);
          setDeleteError("");
          setDeletePassword("");
        }}
        size="sm"
      >
        <ModalHeader
          toggle={() => {
            setShowDeleteModal(false);
            setDeleteError("");
            setDeletePassword("");
          }}
        >
          Delete account
        </ModalHeader>
        <ModalBody>
          <p style={{ fontSize: 14, margin: "0 0 1rem" }}>Are you sure? This will permanently delete your account and all your data. This cannot be undone.</p>
          {!googleUser && (
            <FormGroup className="mb-0">
              <Label style={{ fontSize: 13, fontWeight: 500 }}>Enter your password to confirm</Label>
              <Input type="password" placeholder="Your current password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </FormGroup>
          )}
          {deleteError && (
            <Alert color="danger" style={{ fontSize: 13, marginTop: "0.75rem", marginBottom: 0 }}>
              {deleteError}
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            outline
            onClick={() => {
              setShowDeleteModal(false);
              setDeleteError("");
              setDeletePassword("");
            }}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button color="danger" onClick={handleDeleteAccount} disabled={deleteLoading || (!googleUser && !deletePassword)}>
            {deleteLoading ? "Deleting..." : "Delete my account"}
          </Button>
        </ModalFooter>
      </Modal>
    </Container>
  );
}
