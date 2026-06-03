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
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-forest/10 text-forest border border-forest/20"
      title="Onboarded in the last 30 days"
    >
      New
    </span>
  );
}
