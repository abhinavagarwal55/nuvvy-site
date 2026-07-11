// Gardener i18n — supported locales. English is the default + universal fallback.
// PRD nuvvy-gardener-i18n-prd.md §2.1.

export type Locale = "en" | "hi" | "kn";

export const LOCALES: Locale[] = ["en", "hi", "kn"];
export const DEFAULT_LOCALE: Locale = "en";

// Short labels for the switcher toggle (each shown in its own script).
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  hi: "हिं",
  kn: "ಕನ್ನಡ",
};

// Full names (for menus / accessible labels).
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "hi" || value === "kn";
}

// Coerce any input to a valid Locale, defaulting to English.
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// CSS font-family stack per locale. Indic scripts need Noto; Latin uses DM Sans.
// The referenced CSS variables are defined by next/font in the ops layout.
export const LOCALE_FONT_VAR: Record<Locale, string> = {
  en: "var(--font-dm-sans, sans-serif)",
  hi: "var(--font-noto-deva, var(--font-dm-sans, sans-serif))",
  kn: "var(--font-noto-kannada, var(--font-dm-sans, sans-serif))",
};
