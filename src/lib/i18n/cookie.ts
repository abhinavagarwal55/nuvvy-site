import { toLocale, type Locale } from "./locales";

// Mirror of the active locale so server components render flash-free without a
// DB round-trip. Source of truth is gardeners.preferred_language; this is a
// convenience cache. PRD §2.2.
export const LANG_COOKIE = "nuvvy_lang";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// ---- Client helpers (document.cookie) ----

export function readLocaleCookieClient(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LANG_COOKIE}=`));
  return toLocale(match?.split("=")[1]);
}

export function writeLocaleCookieClient(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
}

// ---- Server helper (Next cookies() store) ----
// Pass the awaited cookies() store; kept dependency-light so this file stays
// usable from both client and server without importing next/headers here.
export function readLocaleFromStore(store: {
  get: (name: string) => { value: string } | undefined;
}): Locale {
  return toLocale(store.get(LANG_COOKIE)?.value);
}
