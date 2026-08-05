// src/features/errors/NotFoundPage.tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Container, Button, Alert } from "reactstrap";

export const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Container className="mt-5 text-center">
      <Alert color="warning">
        <h1 className="display-1">404</h1>
        <h2>{t("errors.pageNotFound")}</h2>
        <p className="lead">{t("errors.notFoundMovedBody")}</p>
        <Link to="/">
          <Button color="primary" size="lg" className="mt-3">
            {t("errors.goHome")}
          </Button>
        </Link>
      </Alert>
    </Container>
  );
};
