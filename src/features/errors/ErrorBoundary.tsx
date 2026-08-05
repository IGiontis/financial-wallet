// src/features/errors/ErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Button, Container } from "reactstrap";

export const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const { t } = useTranslation();

  const homeButton = (
    <Link to="/">
      <Button color="primary">{t("errors.goHome")}</Button>
    </Link>
  );

  // Handle different error types
  if (isRouteErrorResponse(error)) {
    // HTTP errors (404, 500, etc.)
    if (error.status === 404) {
      return (
        <Container className="mt-5">
          <Alert color="warning">
            <h1>404 — {t("errors.pageNotFound")}</h1>
            <p>{t("errors.pageNotFoundBody")}</p>
            {homeButton}
          </Alert>
        </Container>
      );
    }

    if (error.status === 401) {
      return (
        <Container className="mt-5">
          <Alert color="danger">
            <h1>401 — {t("errors.unauthorizedTitle")}</h1>
            <p>{t("errors.unauthorizedBody")}</p>
            <Link to="/login">
              <Button color="primary">{t("auth.signIn")}</Button>
            </Link>
          </Alert>
        </Container>
      );
    }

    if (error.status === 500) {
      return (
        <Container className="mt-5">
          <Alert color="danger">
            <h1>500 — {t("errors.serverErrorTitle")}</h1>
            <p>{t("errors.serverErrorBody")}</p>
          </Alert>
        </Container>
      );
    }
  }

  // JavaScript errors
  if (error instanceof Error) {
    return (
      <Container className="mt-5">
        <Alert color="danger">
          <h1>{t("errors.genericTitle")}</h1>
          <p>{error.message}</p>
          {import.meta.env.DEV && <pre className="mt-3">{error.stack}</pre>}
          <div className="mt-3">{homeButton}</div>
        </Alert>
      </Container>
    );
  }

  // Unknown error
  return (
    <Container className="mt-5">
      <Alert color="danger">
        <h1>{t("errors.unknownTitle")}</h1>
        <p>{t("errors.unexpectedBody")}</p>
        {homeButton}
      </Alert>
    </Container>
  );
};
