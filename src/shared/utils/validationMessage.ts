import type { TFunction } from "i18next";

/**
 * Yup schemas are built outside React, so they can't call `t()` themselves.
 * Instead they store an i18n **key** as the message, optionally with a count
 * suffix for pluralised keys — `"validation.maxChars|40"`. This resolves one at
 * render time, inside a component that does have `t`.
 *
 * Anything that isn't a `validation.*` key is passed through untouched, which
 * covers messages a schema interpolates itself (e.g. a formatted currency cap).
 */
export function validationMessage(message: unknown, t: TFunction): string | undefined {
  if (typeof message !== "string") return undefined;
  const [key, count] = message.split("|");
  if (!key.startsWith("validation.")) return message;
  return count ? t(key, { count: Number(count) }) : t(key);
}
