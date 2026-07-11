import type { Locale } from "./locales";
import { lookup } from "./dictionary";

// t(key, locale, vars?) — resolves a static UI string.
// Fallback chain: locale value → English value → the key itself (never blank).
// Interpolates {name} tokens from `vars`.
export function t(
  key: string,
  locale: Locale,
  vars?: Record<string, string | number>
): string {
  const raw = lookup(key, locale) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}
