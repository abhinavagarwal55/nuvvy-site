import { redirect } from "next/navigation";

// Relocated under Procurement (PRD §9.1). Old path kept as a redirect.
export default async function NurseryTripDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ops/procurement/trips/${id}`);
}
