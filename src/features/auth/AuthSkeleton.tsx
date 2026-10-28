import { Card, CardBody, Col, Container, Row } from "reactstrap";
import { Skeleton } from "../../shared/components/Skeletons";
import styles from "./css/Auth.module.css";

const round = { borderRadius: "var(--border-radius-md)" };

/**
 * The sign-in page's outline, line for line: the language switch, the brand,
 * and the card — the Google button, «ή», two fields, the button and the link
 * under it — in the same columns and spacing as LoginPage, so the page that
 * replaces it moves nothing. It used to be the card alone, in the middle of
 * the screen, and the whole page jumped into place around it.
 */
export function AuthSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <Container>
        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={7} lg={5} xl={4}>
            <div className="d-flex justify-content-center mb-3">
              <Skeleton height={32} width={196} style={round} />
            </div>

            <div className="d-flex flex-column align-items-center mb-4">
              <Skeleton height={56} width={56} style={{ borderRadius: "50%", marginBottom: "1rem" }} />
              <Skeleton height={20} width={120} />
              <Skeleton height={14} width={200} style={{ marginTop: 6 }} />
            </div>

            <Card className={styles.card}>
              <CardBody className="p-4 p-sm-5">
                <Skeleton height={20} width="55%" />
                <Skeleton height={14} width="70%" style={{ marginTop: 6, marginBottom: "1.5rem" }} />
                <Skeleton height={44} style={round} />
                <Skeleton height={12} width="20%" style={{ margin: "1.5rem auto" }} />
                <Skeleton height={14} width="25%" style={{ marginBottom: 8 }} />
                <Skeleton height={38} style={{ ...round, marginBottom: "1rem" }} />
                <Skeleton height={14} width="30%" style={{ marginBottom: 8 }} />
                <Skeleton height={38} style={{ ...round, marginBottom: "1.5rem" }} />
                <Skeleton height={38} style={round} />
                <Skeleton height={14} width="60%" style={{ margin: "1.5rem auto 0" }} />
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default AuthSkeleton;
