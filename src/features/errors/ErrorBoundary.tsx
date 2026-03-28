// src/features/errors/ErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";
import { Alert, Button, Container } from "reactstrap";

export const ErrorBoundary: React.FC = () => {
  const error = useRouteError();

  // Handle different error types
  if (isRouteErrorResponse(error)) {
    // HTTP errors (404, 500, etc.)
    if (error.status === 404) {
      return (
        <Container className="mt-5">
          <Alert color="warning">
            <h1>404 - Page Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
            <Link to="/">
              <Button color="primary">Go Home</Button>
            </Link>
          </Alert>
        </Container>
      );
    }

    if (error.status === 401) {
      return (
        <Container className="mt-5">
          <Alert color="danger">
            <h1>401 - Unauthorized</h1>
            <p>You need to log in to access this page.</p>
            <Link to="/login">
              <Button color="primary">Login</Button>
            </Link>
          </Alert>
        </Container>
      );
    }

    if (error.status === 500) {
      return (
        <Container className="mt-5">
          <Alert color="danger">
            <h1>500 - Server Error</h1>
            <p>Something went wrong on our end. Please try again later.</p>
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
          <h1>Oops! Something went wrong</h1>
          <p>{error.message}</p>
          {process.env.NODE_ENV === "development" && <pre className="mt-3">{error.stack}</pre>}
          <Link to="/">
            <Button color="primary" className="mt-3">
              Go Home
            </Button>
          </Link>
        </Alert>
      </Container>
    );
  }

  // Unknown error
  return (
    <Container className="mt-5">
      <Alert color="danger">
        <h1>Unknown Error</h1>
        <p>An unexpected error occurred.</p>
        <Link to="/">
          <Button color="primary">Go Home</Button>
        </Link>
      </Alert>
    </Container>
  );
};
