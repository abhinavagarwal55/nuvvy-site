/**
 * FTC/India-style affiliate disclosure for the public catalog.
 * Shown near the top of the Accessories segment and in the page footer.
 */
export default function AffiliateDisclosure({ subtle = false }: { subtle?: boolean }) {
  const cls = subtle
    ? "text-xs text-gray-500"
    : "text-sm text-ink/70 bg-mist border border-leaf/20 rounded-xl px-4 py-2.5";
  return (
    <p className={cls}>
      Nuvvy may earn a small commission when you purchase through these links,
      at no extra cost to you. We only recommend products our horticulturists trust.
    </p>
  );
}
