import { useEffect, useState } from "react";

/**
 * The value, once it has stopped changing.
 *
 * For a text box that drives something expensive: the field itself stays
 * immediate, and the work behind it happens once the typing stops rather than
 * once per keystroke. The planner's opening balance was rebuilding a
 * three-year projection on every character — about 150ms each, which is felt
 * as the page sticking to your fingers.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
