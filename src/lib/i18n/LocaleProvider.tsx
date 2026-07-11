"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_FONT_VAR, type Locale } from "./locales";
import { writeLocaleCookieClient } from "./cookie";
import { t as translate } from "./t";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Mirror to cookie immediately so a reload keeps the choice with no flash.
    writeLocaleCookieClient(next);
    // Persist to the server (source of truth). Best-effort — a gardener's
    // choice must never be blocked by a failed network write; the cookie holds.
    void fetch("/api/ops/gardener/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(key, locale, vars),
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      {/* lang + locale-driven font so Indic scripts render (no tofu) and
          switching is instant without a reload. */}
      <div lang={locale} style={{ fontFamily: LOCALE_FONT_VAR[locale] }}>
        {children}
      </div>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider (e.g. an admin
    // screen that shares a component): English, no-op switcher.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(key, DEFAULT_LOCALE, vars),
    };
  }
  return ctx;
}

// Convenience hook mirroring the PRD's useT() name.
export function useT() {
  return useLocale().t;
}
