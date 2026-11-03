import { useState } from "react";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FORM_MODAL } from "../shared/components/formModal";
import { LoginForm } from "../features/auth/LoginForm";
import { RegisterForm } from "../features/auth/RegisterForm";
import { isInAppBrowser } from "../features/auth/inAppBrowser";
import authStyles from "../features/auth/css/Auth.module.css";
import { closeAuthDialog, openAuthDialog, type AuthDialogMode } from "./authDialog";
import { demoAuthActions, enterRealApp } from "./demoSignIn";
import styles from "./css/DemoChrome.module.css";

/**
 * The real sign-in and sign-up forms, in a dialog over the demo — the visitor
 * stays where they were until they are in. Fetched the first time it opens.
 *
 * Signed in, the page loads again as the real app (`enterRealApp`); until the
 * new page has come, the dialog says it is on its way rather than showing a
 * form that has already done its work.
 */
export default function DemoAuthDialog({ mode }: { mode: AuthDialogMode }) {
  const { t } = useTranslation();
  const [entering, setEntering] = useState(false);
  const title = mode === "login" ? t("auth.signIn") : t("auth.createAccount");

  const signedIn = (step?: Parameters<typeof enterRealApp>[0]) => {
    setEntering(true);
    enterRealApp(step);
  };

  // A form: no closing on a stray tap beside it. ✕ and Esc still close it —
  // but not once the page is on its way into the real app.
  const close = entering ? undefined : closeAuthDialog;

  return (
    <Modal {...FORM_MODAL} isOpen toggle={close} centered scrollable className={styles.authDialog} labelledBy="demo-auth-title">
      <ModalHeader toggle={close} tag="h2">
        <span id="demo-auth-title">{title}</span>
      </ModalHeader>
      <ModalBody className={styles.authBody}>
        {entering ? (
          <p className="text-center text-body-secondary my-4" role="status">
            {t("demoMode.entering")}
          </p>
        ) : (
          <>
            {isInAppBrowser && <div className={`${authStyles.inAppWarn} p-3 mb-3 text-center small`}>{t("auth.inAppBrowserWarning")}</div>}
            {mode === "login" ? (
              <LoginForm actions={demoAuthActions} showHeading={false} onSignedIn={signedIn} onSwitch={() => openAuthDialog("register")} />
            ) : (
              <RegisterForm actions={demoAuthActions} showHeading={false} onSignedIn={signedIn} onSwitch={() => openAuthDialog("login")} />
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
