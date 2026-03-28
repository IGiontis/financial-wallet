// src/features/errors/NotFoundPage.tsx
import { Link } from "react-router-dom";
import { Container, Button, Alert } from "reactstrap";

export const NotFoundPage: React.FC = () => {
  return (
    <Container className="mt-5 text-center">
      <Alert color="warning">
        <h1 className="display-1">404</h1>
        <h2>Page Not Found</h2>
        <p className="lead">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/">
          <Button color="primary" size="lg" className="mt-3">
            Return Home
          </Button>
        </Link>
      </Alert>
    </Container>
  );
};
