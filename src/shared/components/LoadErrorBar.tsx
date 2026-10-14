import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadFailed } from "./LoadFailed";

/**
 * Over every page: something the page is showing did not load.
 *
 * One bar for the whole app rather than one per page, so no screen can be left
 * looking empty — "no income yet", "no cards" — when the truth is that its data
 * never arrived. It appears only while a query in use has failed, says it is
 * being tried again (see `installQueryAutoRetry`), and offers to try now.
 */
export function LoadErrorBar() {
  const client = useQueryClient();
  const [failed, setFailed] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const cache = client.getQueryCache();
    const count = () => cache.getAll().filter((q) => q.state.status === "error" && q.getObserversCount() > 0).length;
    setFailed(count());
    // The cache speaks while other components render (a query starting is an
    // event): the count is taken just after, never during their render.
    let live = true;
    const unsubscribe = cache.subscribe(() => queueMicrotask(() => live && setFailed(count())));
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client]);

  if (failed === 0) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await client.refetchQueries({ type: "active", predicate: (q) => q.state.status === "error" });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="px-3 pt-3">
      <LoadFailed onRetry={() => void retry()} retrying={retrying} />
    </div>
  );
}
