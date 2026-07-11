import type { Locale } from "./locales";

// Select the right language variant for a piece of DB content, falling back to
// English when the requested locale's variant is missing/blank. English is
// canonical and never blank; a null/empty hi/kn must never render as blank.
//
// Accepts loose field names so callers can pass DB rows directly, e.g.
//   pickVariant({ en: item.label, hi: item.label_hi, kn: item.label_kn }, locale)
export function pickVariant(
  variants: { en: string | null | undefined; hi?: string | null; kn?: string | null },
  locale: Locale
): string {
  const en = (variants.en ?? "").toString();
  if (locale === "en") return en;
  const v = locale === "hi" ? variants.hi : variants.kn;
  const trimmed = (v ?? "").toString().trim();
  return trimmed !== "" ? (v as string) : en;
}
