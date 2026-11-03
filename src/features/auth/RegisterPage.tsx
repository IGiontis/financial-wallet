import { useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import styles from "./css/Auth.module.css";
import { AuthLanguagePicker } from "./AuthLanguagePicker";
import { BackToDemoLink } from "../../demo/DemoChrome";
import { RegisterForm } from "./RegisterForm";
import { completeSignUp } from "./pendingSignUp";
import { isInAppBrowser } from "./inAppBrowser";

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={7} lg={6} xl={5}>
            {/* The language first: the page is read in it. */}
            <AuthLanguagePicker />

            {/* Brand */}
            <div className="text-center mb-4">
              <div className={`${styles.brandBadge} mx-auto mb-3`}>💳</div>
              <div className="fs-5 fw-semibold text-body-emphasis">MyFiWallet</div>
              <div className="small text-body-secondary">{t("auth.startTracking")}</div>
            </div>

            {isInAppBrowser && <div className={`${styles.inAppWarn} p-3 mb-3 text-center small`}>{t("auth.inAppBrowserWarning")}</div>}

            <Card className={styles.card}>
              <CardBody className="p-4 p-sm-5">
                <RegisterForm
                  onSignedIn={async (step) => {
                    await completeSignUp(step);
                    navigate("/", { replace: true });
                  }}
                />
              </CardBody>
            </Card>

            {/* Only for someone who has not signed in here yet — who came from the demo. */}
            <BackToDemoLink />
          </Col>
        </Row>
      </Container>
    </div>
  );
}
