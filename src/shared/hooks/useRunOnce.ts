import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A button's lock while its action runs: `const [run, running] = useRunOnce()`,
 * then `onClick={() => run(() => remove.mutateAsync(id))}` and
 * `disabled={running}` on it and on everything that could start a second action
 * or close the dialog.
 *
 * `run` refuses a second call while the first is in flight — at once, by a ref,
 * before React has drawn the disabled button (a double-click lands both clicks
 * before the next paint). `running` is the state the screen draws. It lasts as
 * long as the action's own promise: no timers.
 *
 * The action reports its own result (a toast in its try/catch: success only
 * when it went through, a failure saying what did not happen). `run` never
 * rejects — a throw that escaped the action resolves to `undefined`, as does
 * a refused second call — so `onClick={() => void run(…)}` is safe.
 */
export function useRunOnce(): [<T>(action: () => T | Promise<T>) => Promise<T | undefined>, boolean] {
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => T | Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setRunning(true);
    try {
      return await action();
    } catch {
      return undefined;
    } finally {
      busy.current = false;
      if (mounted.current) setRunning(false);
    }
  }, []);

  return [run, running];
}
