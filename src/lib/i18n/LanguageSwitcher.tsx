"use client";

import { LOCALES, LOCALE_LABELS, type Locale } from "./locales";
import { useLocale } from "./LocaleProvider";

// Compact EN / हिं / ಕನ್ನಡ toggle for the gardener surfaces. Switching is
// instant (updates context → all t()/pickVariant re-render) and persists via
// LocaleProvider.setLocale (cookie + POST /api/ops/gardener/language).
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-stone bg-offwhite p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l: Locale) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            className={`min-w-[44px] rounded-full px-2.5 py-1 text-xs transition-colors ${
              active
                ? "bg-forest text-offwhite"
                : "text-charcoal hover:bg-cream"
            }`}
          >
            {LOCALE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
