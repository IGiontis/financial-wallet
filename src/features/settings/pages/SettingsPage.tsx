import { useState } from "react";
import { useRunOnce } from "../../../shared/hooks/useRunOnce";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Row, Col, Card, CardBody, FormGroup, Label, Input, FormFeedback, Button, Modal, ModalHeader, ModalBody, ModalFooter, Alert } from "reactstrap";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getUser, updateUser } from "../../../firebase/firestore";
import { deleteMyAccount, AccountDeletionError } from "../../../firebase/accountDeletion";
import { OfflineActionError } from "../../../shared/utils/offlinePolicy";
import { DISPLAY_NAME_MAX, cleanDisplayName } from "../displayName";
import { SkeletonCard, SkeletonHeading, SkeletonRows } from "../../../shared/components/Skeletons";
import ResetDataSection from "../components/ResetDataSection";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import StatementSection from "../components/StatementSection";
import BillAlertSetting from "../components/BillAlertSetting";
import { TOUR_PARAM } from "../../tour/tourState";
import { updateUserEmail, updateUserPassword, reauthenticate, isGoogleUser } from "../../../firebase/auth";
import { exchangeRateKeys } from "../../../shared/hooks/useCurrencyConverter";
import type { User, UpdateUserDTO } from "../../../shared/types/IndexTypes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageWaiting } from "../../../shared/components/PageWaiting";
import { usePageLoad } from "../../../shared/hooks/usePageLoad";
import { mergeFields } from "../../../lib/listCache";
import { useTranslation } from "react-i18next";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { SUPPORTED_LANGUAGES } from "../../../i18n";
import { PageShell } from "../../../shared/components/PageShell";
import { ThemeSwitch } from "../../../shared/components/ThemeSwitch";
import { NavStylePicker } from "../components/NavStylePicker";
import { useSignOut } from "../../layout/useProfile";
import { PageTabs } from "../../../shared/components/PageTabs";
import { pageTabIds } from "../../../shared/utils/pageTabIds";
import { MotionEffectsSetting } from "../components/MotionEffectsSetting";
import { BusinessSetting } from "../components/BusinessSetting";
import { DEFAULT_SETTINGS_TAB, isSettingsTab, SETTINGS_TABS, SETTINGS_TABS_BASE, settingsTabPath } from "../settingsTabs";
import { FiLogOut } from "react-icons/fi";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { isDemo } from "../../../demo/demoMode";
import { DemoAccountNote } from "../../../demo/DemoChrome";
import { RequiredMark } from "../../../shared/components/RequiredMark";
import { useFormChanged } from "../../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../../shared/components/UnchangedHint";
import { sameValues } from "../../../shared/utils/sameValues";
import { currencyLabel } from "../../../shared/utils/currency";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = (["USD", "EUR", "GBP"] as const).map((value) => ({ value, label: currencyLabel(value) }));

// Languages the app actually ships translations for — see src/i18n
const LOCALES = SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: `${l.flag} ${l.label}` }));

const COUNTRIES = ["Greece", "United States", "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "Portugal", "Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (first: string, last: string) => `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

/** Firebase rejects with an object carrying a `code`; anything else is unknown. */
const errorCode = (err: unknown): string => (typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "");

const getErrorKey = (code: string): string => {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "errors.wrongPassword";
    case "auth/email-already-in-use":
      return "errors.emailInUse";
    case "auth/weak-password":
      return "errors.weakPassword";
    case "auth/requires-recent-login":
      return "errors.requiresRecentLogin";
    default:
      return "errors.generic";
  }
};

/**
 * The account deletion's message. Where it stopped decides what is true now:
 * before the data (nothing changed), during it (the account is still there,
 * deleting again carries on), or after it (only the sign-in is left).
 */
const deleteErrorKey = (err: unknown): string => {
  if (err instanceof OfflineActionError) return "common.offlineDelete";
  if (!(err instanceof AccountDeletionError)) return getErrorKey(errorCode(err));
  if (err.stage === "data") return "settings.deleteUnfinished";
  if (err.stage === "sign-in") return "settings.deleteSignInLeft";
  switch (err.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/popup-blocked":
      return "settings.deleteGoogleCancelled";
    case "auth/user-mismatch":
      return "settings.deleteGoogleOtherAccount";
    default:
      return getErrorKey(err.code);
  }
};

/** The profile as its form shows it — what «No change, no Save» compares with. */
const profileStored = (user: User | null) => ({
  firstName: user?.firstName ?? "",
  lastName: user?.lastName ?? "",
  displayName: user?.displayName ?? "",
  username: user?.username ?? "",
  age: (user?.age ?? "") as number | "",
  city: user?.city ?? "",
  country: user?.country ?? "",
});

/** The preferences as their form shows them; the language falls back to the one on screen. */
const prefsStored = (user: User | null, shownLanguage: string | undefined) => ({
  currency: user?.currency ?? "EUR",
  locale: user?.locale ?? shownLanguage ?? "en",
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

/** `fill`: the card is one cell of a two-column row, so it takes the cell's height and leaves the spacing to the row. */
function Section({ title, subtitle, children, fill = false }: { title: string; subtitle?: string; children: React.ReactNode; danger?: boolean; fill?: boolean }) {
  return (
    <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", marginBottom: fill ? 0 : "1rem", height: fill ? "100%" : undefined }}>
      <CardBody style={{ padding: "1.5rem" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ fontWeight: 500, fontSize: "var(--fs-lead)", margin: 0, color: "var(--color-text-primary)" }}>{title}</p>
          {subtitle && <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", margin: 0 }}>{subtitle}</p>}
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
  const { t, i18n } = useTranslation();
  const signOut = useSignOut();
  // Which tab the address names; anything else is sent to Profile below.
  const { tab: tabParam } = useParams();
  const tab = isSettingsTab(tabParam) ? tabParam : null;

  const [userData, setUserData] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  // Runs once — a ref refuses a second press before the button is drawn disabled.
  const [runDelete, deleteLoading] = useRunOnce();
  const [deleteError, setDeleteError] = useState("");

  // The user document, read afresh on opening as it always was — through the
  // shared query now (`exchangeRateKeys.user`), so a failed read is retried on
  // its own (`installQueryAutoRetry`) instead of leaving the forms blank, and
  // one that never answers holds the skeleton only for a few seconds
  // (`usePageLoad`): then Profile and Preferences say so quietly, past the
  // skeleton's time they take a copy already on the device, and the other
  // tabs, which need none of it, are there.
  const uid = currentUser?.uid ?? "";
  const userQuery = useQuery({ queryKey: exchangeRateKeys.user(uid), queryFn: () => getUser(uid), enabled: !!uid, staleTime: 0 });
  const userLoad = usePageLoad(loadingUser);
  // Taken once, while rendering (React's «adjust state on a change» pattern):
  // after that the page's own copy is what its forms compare with and save.
  if (loadingUser && userQuery.data !== undefined && (userQuery.isFetchedAfterMount || userLoad === "waiting")) {
    setUserData(userQuery.data);
    setLoadingUser(false);
  }

  // ── Profile form (email/password users only) ───────────────────────────────

  const profileForm = useFormik({
    enableReinitialize: true,
    initialValues: profileStored(userData),
    validationSchema: Yup.object({
      firstName: Yup.string().required("validation.firstNameRequired").max(50, "validation.maxChars|50"),
      lastName: Yup.string().required("validation.lastNameRequired").max(50, "validation.maxChars|50"),
      displayName: Yup.string().trim().max(DISPLAY_NAME_MAX, `validation.maxChars|${DISPLAY_NAME_MAX}`),
      username: Yup.string()
        .required("validation.usernameRequired")
        .min(3, "validation.minChars|3")
        .max(30, "validation.maxChars|30")
        .matches(/^[a-zA-Z0-9_]+$/, "validation.usernameFormat"),
      age: Yup.number().typeError("validation.mustBeNumber").min(13, "validation.atLeast|13").max(120, "validation.atMost|120").optional(),
      city: Yup.string().max(100, "validation.maxChars|100"),
      country: Yup.string().max(100, "validation.maxChars|100"),
    }),
    onSubmit: async (values) => {
      // «No change, no Save»: nothing changed, nothing written, nothing said.
      if (sameValues(profileStored(userData), values)) return;
      try {
        const data: UpdateUserDTO = {
          firstName: values.firstName,
          lastName: values.lastName,
          // "" clears it: the name shown goes back to Google's or the username (see `resolveDisplayName`).
          displayName: cleanDisplayName(values.displayName),
          username: values.username,
          // Cleared: `null`, so the stored value is taken off (`updateUser` → `forUpdate`).
          age: values.age ? Number(values.age) : null,
          city: values.city.trim() ? values.city : null,
          country: values.country.trim() ? values.country : null,
        };
        // Write straight into the cache so the Topbar updates without a refresh.
        // No invalidate afterwards — that would discard this and re-read the
        // document we just wrote. An edit never waits for the server
        // (`.claude/rules/ui.md`): said at once; a refusal puts it back and says so.
        const key = exchangeRateKeys.user(currentUser!.uid);
        const before = queryClient.getQueryData<User | null>(key);
        queryClient.setQueryData(key, (old: User | null) => mergeFields((old ?? {}) as User, data));
        // What the form compares with is now what was saved: Save waits for the next change.
        const userBefore = userData;
        setUserData((old) => (old ? mergeFields(old, data) : old));
        updateUser(currentUser!.uid, data).catch(() => {
          queryClient.setQueryData(key, before);
          setUserData(userBefore);
          toast.error(t("settings.profileUpdateFailed"));
        });

        toast.success(t("settings.profileUpdated"));
      } catch {
        toast.error(t("settings.profileUpdateFailed"));
      }
    },
  });

  // ── Preferences form ───────────────────────────────────────────────────────

  const prefsForm = useFormik({
    enableReinitialize: true,
    initialValues: prefsStored(userData, i18n.resolvedLanguage),
    validationSchema: Yup.object({
      currency: Yup.string().oneOf(["USD", "EUR", "GBP"]).required(),
      locale: Yup.string().required(),
    }),
    onSubmit: async (values) => {
      // «No change, no Save»: nothing changed, nothing written, nothing said.
      if (sameValues(prefsStored(userData, i18n.resolvedLanguage), values)) return;
      try {
        // Never waits for the server: on screen at once, put back and said if refused.
        const key = exchangeRateKeys.user(currentUser!.uid);
        const before = queryClient.getQueryData<User | null>(key);
        const userBefore = userData;
        setUserData((old) => (old ? ({ ...old, currency: values.currency, locale: values.locale } as User) : old));
        updateUser(currentUser!.uid, {
          currency: values.currency as "USD" | "EUR" | "GBP",
          locale: values.locale,
        }).catch(() => {
          queryClient.setQueryData(key, before);
          setUserData(userBefore);
          toast.error(t("settings.preferencesFailed"));
        });
        // Apply the language immediately — i18next persists it to localStorage
        await i18n.changeLanguage(values.locale);
        queryClient.setQueryData(key, (old: User | null) => ({ ...(old ?? {}), currency: values.currency, locale: values.locale }) as User);
        toast.success(t("settings.preferencesSaved"));
      } catch {
        toast.error(t("settings.preferencesFailed"));
      }
    },
  });

  // ── Email form ─────────────────────────────────────────────────────────────

  const emailForm = useFormik({
    initialValues: { newEmail: "", currentPassword: "" },
    validationSchema: Yup.object({
      newEmail: Yup.string().email("validation.emailInvalid").required("validation.emailRequired"),
      currentPassword: Yup.string().required("validation.currentPasswordRequired"),
    }),
    onSubmit: async (values, { resetForm }) => {
      try {
        await reauthenticate(values.currentPassword);
        await updateUserEmail(values.newEmail);
        toast.success(t("settings.emailVerificationSent"));
        resetForm();
      } catch (err) {
        toast.error(t(getErrorKey(errorCode(err))));
      }
    },
  });

  // ── Password form ──────────────────────────────────────────────────────────

  const passwordForm = useFormik({
    initialValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validationSchema: Yup.object({
      currentPassword: Yup.string().required("validation.currentPasswordRequired"),
      newPassword: Yup.string().required("validation.newPasswordRequired").min(6, "validation.passwordMin"),
      confirmPassword: Yup.string()
        .required("validation.confirmPasswordRequired")
        .oneOf([Yup.ref("newPassword")], "validation.passwordsNoMatch"),
    }),
    onSubmit: async (values, { resetForm }) => {
      try {
        await reauthenticate(values.currentPassword);
        await updateUserPassword(values.newPassword);
        toast.success(t("settings.passwordChanged"));
        resetForm();
      } catch (err) {
        toast.error(t(getErrorKey(errorCode(err))));
      }
    },
  });

  // ── Delete account ─────────────────────────────────────────────────────────

  // Everything on this page changes what the rest of the app means, or is the
  // account itself. None of it is sensible to queue against a copy.
  const settingsGuard = useOfflineGuard("settings");
  const deleteGuard = useOfflineGuard("delete");
  // «No change, no Save» (`useFormChanged`): compared with what is stored, by
  // meaning — a name with a trailing space, or age "30" against 30, is no change.
  const { unchanged: profileUnchanged } = useFormChanged(profileStored(userData), profileForm.values);
  const { unchanged: prefsUnchanged } = useFormChanged(prefsStored(userData, i18n.resolvedLanguage), prefsForm.values);

  // Who it is first (password, or Google's window), then the data, then the
  // sign-in, then this device forgets it and loads again on the sign-in form —
  // see `accountDeletion`. What the message says depends on where it stopped.
  // Done, the page loads again on the sign-in form — that is its answer.
  const handleDeleteAccount = () =>
    runDelete(async () => {
      setDeleteError("");
      try {
        await deleteMyAccount({ uid: currentUser!.uid, google: googleUser, password: deletePassword });
      } catch (err) {
        const key = deleteErrorKey(err);
        setDeleteError(key);
        // Stopped with only the sign-in left, the device has signed out and this
        // page is on its way to the sign-in form: the dialog goes with it, the
        // toast stays until read. Anywhere else: said beside the button, and as a toast.
        if (err instanceof AccountDeletionError && err.stage === "sign-in") toast.error(t(key), { autoClose: false });
        else toast.error(t(key));
      }
    });
  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setShowDeleteModal(false);
    setDeleteError("");
    setDeletePassword("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // /settings/anything-else lands on Profile rather than on an empty page.
  if (!tab) return <Navigate to={settingsTabPath(DEFAULT_SETTINGS_TAB)} replace />;

  // The title and the tabs draw at once, while the account is still loading:
  // the tab you asked for is already known, and only its cards wait.
  const header = (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("settings.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("settings.subtitle")}</p>
      </div>
      {/* Each tab its own address (/settings/<id>): «back» steps back through them, a link opens any one. */}
      <PageTabs
        base={SETTINGS_TABS_BASE}
        label={t("settings.title")}
        tabs={SETTINGS_TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
        value={tab}
        onChange={(next) => {
          if (next !== tab) navigate(settingsTabPath(next));
        }}
      />
    </>
  );
  const tabIds = pageTabIds(SETTINGS_TABS_BASE, tab);
  const panelProps = { id: tabIds.panel, role: "tabpanel", "aria-labelledby": tabIds.tab } as const;

  if (userLoad === "waiting" && (tab === "profile" || tab === "preferences")) {
    return (
      <PageShell>
        {header}
        <div {...panelProps}>
          <PageWaiting />
        </div>
      </PageShell>
    );
  }
  if (userLoad === "loading") {
    return (
      <PageShell>
        {header}
        <div {...panelProps} aria-busy="true">
          <Row className="g-3">
            {Array.from({ length: 2 }, (_, i) => (
              <Col key={i} xs={12} lg={6}>
                <SkeletonCard>
                  <SkeletonHeading />
                  <SkeletonRows count={3} icon={false} />
                </SkeletonCard>
              </Col>
            ))}
          </Row>
        </div>
      </PageShell>
    );
  }

  const initials = getInitials(userData?.firstName ?? currentUser?.displayName?.split(" ")[0] ?? "", userData?.lastName ?? currentUser?.displayName?.split(" ")[1] ?? "");

  // The same cards as before, each in the tab it belongs to — nothing in them
  // saves any differently. Two columns on a wide screen where two cards stand
  // on their own; Data stays one column, because its order is the point: the
  // statement sits right above "start over".
  return (
    <PageShell>
      {header}

      <div {...panelProps}>
        {tab === "profile" && (
          <>
            {/* ── Profile ─────────────────────────────────────────────────────────── */}
            <Section title={t("settings.profile")} subtitle={t("settings.profileSubtitle")}>
              {/* Avatar row */}
              <div className="d-flex align-items-center gap-3 mb-4">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    fontWeight: 600,
                    color: "var(--on-brand)",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div>
                  <p style={{ fontWeight: 500, fontSize: "var(--fs-lead)", margin: 0 }}>{userData?.firstName ? `${userData.firstName} ${userData.lastName}` : (currentUser?.displayName ?? "—")}</p>
                  <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", margin: 0 }}>{currentUser?.email}</p>
                </div>
              </div>

              {/* Google users — read only message */}
              {googleUser ? (
                <div
                  style={{
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    padding: "1rem",
                    fontSize: "var(--fs-text)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {t("settings.googleManaged")}
                </div>
              ) : (
                /* Email/password users — editable form */
                <form onSubmit={profileForm.handleSubmit} noValidate>
                  <Row className="g-3">
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("auth.firstName")}
                          <RequiredMark />
                        </Label>
                        <Input
                          aria-required
                          type="text"
                          name="firstName"
                          value={profileForm.values.firstName}
                          onChange={profileForm.handleChange}
                          onBlur={profileForm.handleBlur}
                          invalid={!!(profileForm.touched.firstName && profileForm.errors.firstName)}
                        />
                        <FormFeedback>{validationMessage(profileForm.errors.firstName, t)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("auth.lastName")}
                          <RequiredMark />
                        </Label>
                        <Input
                          aria-required
                          type="text"
                          name="lastName"
                          value={profileForm.values.lastName}
                          onChange={profileForm.handleChange}
                          onBlur={profileForm.handleBlur}
                          invalid={!!(profileForm.touched.lastName && profileForm.errors.lastName)}
                        />
                        <FormFeedback>{validationMessage(profileForm.errors.lastName, t)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("auth.username")}
                          <RequiredMark />
                        </Label>
                        <Input
                          aria-required
                          type="text"
                          name="username"
                          value={profileForm.values.username}
                          onChange={profileForm.handleChange}
                          onBlur={profileForm.handleBlur}
                          invalid={!!(profileForm.touched.username && profileForm.errors.username)}
                        />
                        <FormFeedback>{validationMessage(profileForm.errors.username, t)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.displayName")} <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>({t("common.optional")})</span>
                        </Label>
                        <Input
                          type="text"
                          name="displayName"
                          placeholder={t("settings.displayNameHint")}
                          value={profileForm.values.displayName}
                          onChange={profileForm.handleChange}
                          onBlur={profileForm.handleBlur}
                          maxLength={DISPLAY_NAME_MAX}
                          invalid={!!(profileForm.touched.displayName && profileForm.errors.displayName)}
                          aria-describedby="display-name-count"
                        />
                        {/* What the top bar will show, and how much room is left for it. */}
                        <div id="display-name-count" className="d-flex justify-content-between gap-2 mt-1 small text-body-secondary">
                          <span>{t("settings.displayNameShown")}</span>
                          <span className="tabular-nums">
                            {Array.from(profileForm.values.displayName.trim()).length}/{DISPLAY_NAME_MAX}
                          </span>
                        </div>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={4}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.age")} <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>({t("common.optional")})</span>
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
                        <FormFeedback>{validationMessage(profileForm.errors.age, t)}</FormFeedback>
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={4}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.city")} <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>({t("common.optional")})</span>
                        </Label>
                        <Input type="text" name="city" value={profileForm.values.city} onChange={profileForm.handleChange} onBlur={profileForm.handleBlur} />
                      </FormGroup>
                    </Col>
                    <Col xs={12} md={4}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.country")} <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>({t("common.optional")})</span>
                        </Label>
                        <Input type="select" name="country" value={profileForm.values.country} onChange={profileForm.handleChange}>
                          <option value="">{t("settings.selectCountry")}</option>
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Input>
                      </FormGroup>
                    </Col>
                  </Row>
                  <div className="d-flex justify-content-end align-items-center gap-2 mt-4">
                    <UnchangedHint show={profileUnchanged} />
                    <Button type="submit" color="primary" disabled={profileForm.isSubmitting || profileUnchanged || settingsGuard.locked} title={settingsGuard.reason}>
                      {profileForm.isSubmitting ? t("common.saving") : t("settings.saveProfile")}
                    </Button>
                  </div>
                </form>
              )}
            </Section>
          </>
        )}

        {tab === "preferences" && (
          <Row className="g-3 mb-3">
            <Col xs={12} lg={6}>
              {/* ── Preferences ─────────────────────────────────────────────────────── */}
              <Section title={t("settings.preferences")} subtitle={t("settings.preferencesSubtitle")} fill>
                <form onSubmit={prefsForm.handleSubmit} noValidate>
                  <Row className="g-3">
                    <Col xs={12} md={6}>
                      <FormGroup className="mb-0">
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.currency")}
                          <RequiredMark />
                        </Label>
                        <Input type="select" name="currency" aria-required value={prefsForm.values.currency} onChange={prefsForm.handleChange}>
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
                        <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                          {t("settings.language")}
                          <RequiredMark />
                        </Label>
                        <Input type="select" name="locale" aria-required value={prefsForm.values.locale} onChange={prefsForm.handleChange}>
                          {LOCALES.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          ))}
                        </Input>
                      </FormGroup>
                    </Col>
                  </Row>
                  <div className="d-flex justify-content-end align-items-center gap-2 mt-4">
                    <UnchangedHint show={prefsUnchanged} />
                    <Button type="submit" color="primary" disabled={prefsForm.isSubmitting || prefsUnchanged || settingsGuard.locked} title={settingsGuard.reason}>
                      {prefsForm.isSubmitting ? t("common.saving") : t("settings.savePreferences")}
                    </Button>
                  </div>
                </form>
              </Section>
            </Col>
            <Col xs={12} lg={6}>
              {/* ── Theme ─────────────────────────────────────────────────────── */}
              {/* Kept on this device, as it always was, and applied the moment it
                  is pressed — the same switch as in the menu and the sidebar. */}
              <Section title={t("nav.theme")} subtitle={t("settings.themeSubtitle")} fill>
                <ThemeSwitch className="w-100" />
              </Section>
            </Col>
            <Col xs={12}>
              {/* ── Colours ───────────────────────────────────────────────────── */}
              {/* Like the theme: on this device, and applied as it is pressed —
                  the sidebar and top bar change behind the card. */}
              <Section title={t("settings.colourway")} subtitle={t("settings.colourwaySubtitle")} fill>
                <NavStylePicker />
              </Section>
            </Col>
            <Col xs={12} lg={6}>
              {/* ── Moving effects ────────────────────────────────────────────── */}
              {/* On this device, applied as it is pressed: «Όχι» stops what loops
                  for ever (the goal tanks' water, the loading shimmer). */}
              <Section title={t("settings.motion")} subtitle={t("settings.motionSubtitle")} fill>
                <MotionEffectsSetting />
              </Section>
            </Col>
            <Col xs={12} lg={6}>
              {/* ── The «Δουλειά» page ────────────────────────────────────────── */}
              {/* With the account: on, the page joins the menu; off, it goes and its records stay. */}
              <Section title={t("settings.business")} subtitle={t("settings.businessSubtitle")} fill>
                <BusinessSetting />
              </Section>
            </Col>
            <Col xs={12}>
              {/* ── The welcome tour, again ───────────────────────────────────── */}
              <Section title={t("tour.settingsTitle")} subtitle={t("tour.settingsSubtitle")} fill>
                <Button color="primary" outline onClick={() => navigate(`/?${TOUR_PARAM}=1`)}>
                  {t("tour.settingsButton")}
                </Button>
              </Section>
            </Col>
            <Col xs={12}>
              {/* ── Notifications ─────────────────────────────────────────────── */}
              <Section title={t("settings.notifications")} subtitle={t("settings.notificationsSubtitle")} fill>
                <BillAlertSetting />
              </Section>
            </Col>
          </Row>
        )}

        {tab === "data" && (
          <>
            {/* ── Categories: managed on their own page, with the payees ──────────── */}
            {/* One place for them (item 85): «Δικαιούχοι & κατηγορίες», under
                Transactions. Here only the way there. */}
            <Section title={t("categories.manageTitle")} subtitle={t("names.settingsHint")}>
              <Link to="/transactions/names?tab=categories" className="btn btn-outline-secondary btn-sm">
                {t("names.settingsLink")} ›
              </Link>
            </Section>

            {/* ── Statement ───────────────────────────────────────────────────────── */}
            {/* Deliberately just above "start over": the last thing anyone should
                meet before a button that clears their records is the one that gets a
                copy of them out first. */}
            <Section title={t("statement.sectionTitle")} subtitle={t("statement.sectionSubtitle")}>
              <StatementSection />
            </Section>

            {/* ── Start over ──────────────────────────────────────────────────────── */}
            <Section title={t("settings.resetTitle")} subtitle={t("settings.resetSubtitle")}>
              <ResetDataSection />
            </Section>
          </>
        )}

        {/* The demo's account is a stand-in with no Firebase behind it: its
            email, password, signing out and deleting it would only be refused
            (see `firebase/auth`). One card says so and leads to a real one. */}
        {tab === "account" && isDemo() && <DemoAccountNote />}

        {tab === "account" && !isDemo() && (
          <>
            {googleUser ? (
              <>
                {/* ── Account security (Google users) ─────────────────────────────────── */}
                <Section title={t("settings.accountSecurity")} subtitle={t("settings.googleSecuritySubtitle")}>
                  <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", margin: 0 }}>
                    {t("settings.googleSecurityBody")}
                  </p>
                </Section>
              </>
            ) : (
              <Row className="g-3 mb-3">
                <Col xs={12} lg={6}>
                  {/* ── Email (email/password users only) ───────────────────────────────── */}
                  <Section title={t("settings.emailAddress")} subtitle={t("settings.emailSubtitle")} fill>
                    <form onSubmit={emailForm.handleSubmit} noValidate>
                      <Row className="g-3">
                        <Col xs={12}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>{t("settings.currentEmail")}</Label>
                            <Input type="text" value={currentUser?.email ?? ""} disabled style={{ background: "var(--color-background-secondary)" }} />
                          </FormGroup>
                        </Col>
                        <Col xs={12} md={6}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                              {t("settings.newEmail")}
                              <RequiredMark />
                            </Label>
                            <Input
                              aria-required
                              type="email"
                              name="newEmail"
                              value={emailForm.values.newEmail}
                              onChange={emailForm.handleChange}
                              onBlur={emailForm.handleBlur}
                              invalid={!!(emailForm.touched.newEmail && emailForm.errors.newEmail)}
                            />
                            <FormFeedback>{validationMessage(emailForm.errors.newEmail, t)}</FormFeedback>
                          </FormGroup>
                        </Col>
                        <Col xs={12} md={6}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                              {t("settings.currentPassword")}
                              <RequiredMark />
                            </Label>
                            <Input
                              aria-required
                              type="password"
                              name="currentPassword"
                              placeholder={t("settings.requiredToConfirm")}
                              value={emailForm.values.currentPassword}
                              onChange={emailForm.handleChange}
                              onBlur={emailForm.handleBlur}
                              invalid={!!(emailForm.touched.currentPassword && emailForm.errors.currentPassword)}
                            />
                            <FormFeedback>{validationMessage(emailForm.errors.currentPassword, t)}</FormFeedback>
                          </FormGroup>
                        </Col>
                      </Row>
                      <div className="d-flex justify-content-end mt-4">
                        <Button type="submit" color="primary" disabled={emailForm.isSubmitting || !emailForm.dirty || settingsGuard.locked} title={settingsGuard.reason}>
                          {emailForm.isSubmitting ? t("settings.updating") : t("settings.updateEmail")}
                        </Button>
                      </div>
                    </form>
                  </Section>
                </Col>
                <Col xs={12} lg={6}>
                  {/* ── Password (email/password users only) ─────────────────────────────── */}
                  <Section title={t("settings.changePassword")} subtitle={t("settings.passwordSubtitle")} fill>
                    <form onSubmit={passwordForm.handleSubmit} noValidate>
                      <Row className="g-3">
                        <Col xs={12}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                              {t("settings.currentPassword")}
                              <RequiredMark />
                            </Label>
                            <Input
                              aria-required
                              type="password"
                              name="currentPassword"
                              value={passwordForm.values.currentPassword}
                              onChange={passwordForm.handleChange}
                              onBlur={passwordForm.handleBlur}
                              invalid={!!(passwordForm.touched.currentPassword && passwordForm.errors.currentPassword)}
                            />
                            <FormFeedback>{validationMessage(passwordForm.errors.currentPassword, t)}</FormFeedback>
                          </FormGroup>
                        </Col>
                        <Col xs={12} md={6}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                              {t("settings.newPassword")}
                              <RequiredMark />
                            </Label>
                            <Input
                              aria-required
                              type="password"
                              name="newPassword"
                              value={passwordForm.values.newPassword}
                              onChange={passwordForm.handleChange}
                              onBlur={passwordForm.handleBlur}
                              invalid={!!(passwordForm.touched.newPassword && passwordForm.errors.newPassword)}
                            />
                            <FormFeedback>{validationMessage(passwordForm.errors.newPassword, t)}</FormFeedback>
                          </FormGroup>
                        </Col>
                        <Col xs={12} md={6}>
                          <FormGroup className="mb-0">
                            <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                              {t("settings.confirmNewPassword")}
                              <RequiredMark />
                            </Label>
                            <Input
                              aria-required
                              type="password"
                              name="confirmPassword"
                              value={passwordForm.values.confirmPassword}
                              onChange={passwordForm.handleChange}
                              onBlur={passwordForm.handleBlur}
                              invalid={!!(passwordForm.touched.confirmPassword && passwordForm.errors.confirmPassword)}
                            />
                            <FormFeedback>{validationMessage(passwordForm.errors.confirmPassword, t)}</FormFeedback>
                          </FormGroup>
                        </Col>
                      </Row>
                      <div className="d-flex justify-content-end mt-4">
                        <Button type="submit" color="primary" disabled={passwordForm.isSubmitting || !passwordForm.dirty || settingsGuard.locked} title={settingsGuard.reason}>
                          {passwordForm.isSubmitting ? t("settings.changing") : t("settings.changePassword")}
                        </Button>
                      </div>
                    </form>
                  </Section>
                </Col>
              </Row>
            )}

            <Row className="g-3 mb-3">
              <Col xs={12} lg={6}>
                {/* ── Sign out ──────────────────────────────────────────────── */}
                <Section title={t("nav.signOut")} subtitle={t("settings.signOutSubtitle")} fill>
                  <Button color="secondary" outline onClick={signOut} className="d-inline-flex align-items-center gap-2">
                    <FiLogOut size={16} aria-hidden />
                    {t("nav.signOut")}
                  </Button>
                </Section>
              </Col>
              <Col xs={12} lg={6}>
                {/* ── Danger zone ───────────────────────────────────────────── */}
                <Card style={{ border: "0.5px solid var(--bs-danger)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", marginBottom: 0, height: "100%" }}>
                  <CardBody style={{ padding: "1.5rem" }}>
                    <p style={{ fontWeight: 500, fontSize: "var(--fs-lead)", margin: "0 0 4px", color: "var(--bs-danger)" }}>{t("settings.dangerZone")}</p>
                    <p style={{ fontSize: "var(--fs-text)", color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
                      {t("settings.dangerZoneBody")}
                    </p>
                    <DeleteButton opensConfirm label={t("settings.deleteAccount")} onClick={() => setShowDeleteModal(true)} disabled={deleteGuard.locked} title={deleteGuard.reason} />
                  </CardBody>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>

      {/* ── Delete account modal ─────────────────────────────────────────────── */}
      <Modal isOpen={showDeleteModal} toggle={closeDeleteModal} backdrop={deleteLoading ? "static" : true} keyboard={!deleteLoading} size="sm">
        <ModalHeader toggle={deleteLoading ? undefined : closeDeleteModal}>
          {t("settings.deleteAccount")}
        </ModalHeader>
        <ModalBody>
          <p style={{ fontSize: "var(--fs-lead)", margin: "0 0 1rem" }}>{t("settings.deleteConfirmBody")}</p>
          {googleUser && <p className="small text-body-secondary mb-0">{t("settings.deleteGoogleConfirm")}</p>}
          {!googleUser && (
            <FormGroup className="mb-0">
              <Label style={{ fontSize: "var(--fs-text)", fontWeight: 500 }}>
                {t("settings.enterPasswordConfirm")}
                <RequiredMark />
              </Label>
              <Input type="password" aria-required placeholder={t("settings.yourCurrentPassword")} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </FormGroup>
          )}
          {deleteError && (
            <Alert color="danger" style={{ fontSize: "var(--fs-text)", marginTop: "0.75rem", marginBottom: 0 }}>
              {t(deleteError)}
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={closeDeleteModal} disabled={deleteLoading}>
            {t("common.cancel")}
          </Button>
          <Button color="danger" onClick={() => void handleDeleteAccount()} aria-busy={deleteLoading || undefined} disabled={deleteLoading || (!googleUser && !deletePassword) || deleteGuard.locked} title={deleteGuard.reason}>
            {deleteLoading ? t("common.deleting") : t("settings.deleteMyAccount")}
          </Button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
}
