const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isNewCustomer(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_WINDOW_MS;
}

export function NewCustomerBadge({ createdAt }: { createdAt: string | null | undefined }) {
  if (!isNewCustomer(createdAt)) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-400 text-charcoal shadow-sm"
      title="Onboarded in the last 30 days"
    >
      New
    </span>
  );
}
