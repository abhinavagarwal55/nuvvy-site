import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  checkGardenerUsable,
  applyGardenersToServices,
  repointActiveSlots,
  fetchFutureScheduledServices,
} from "@/lib/services/gardener-assignment";

const BodySchema = z.object({
  primary_gardener_id: z.string().uuid("primary_gardener_id must be a valid UUID"),
  secondary_gardener_id: z.string().uuid().nullable().default(null),
  confirm: z.boolean().default(false),
  apply_service_ids: z.array(z.string().uuid()).optional(),
});

// POST /api/ops/customers/[id]/gardeners
// Change a customer's primary (+ optional secondary co-visit) gardener.
//   confirm=false → preview: future scheduled services split into
//                   default_services (gardener_customized=false, update by default)
//                   and customized_services (gardener_customized=true, opt-in).
//   confirm=true  → commit: update customer + active slots + the selected services'
//                   assigned_gardener_id + junction, with flag bookkeeping + audit.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  // Features 1 & 2: admin + horticulturist only.
  if (auth.role !== "admin" && auth.role !== "horticulturist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: customerId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { primary_gardener_id, secondary_gardener_id, confirm, apply_service_ids } = parsed.data;

  if (secondary_gardener_id && secondary_gardener_id === primary_gardener_id) {
    return NextResponse.json(
      { error: "Secondary gardener must differ from the primary" },
      { status: 409 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Customer must exist.
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, primary_gardener_id, secondary_gardener_id")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Validate gardeners exist + are active.
  const primaryCheck = await checkGardenerUsable(supabase, primary_gardener_id);
  if (!primaryCheck.ok)
    return NextResponse.json({ error: primaryCheck.error }, { status: primaryCheck.status });
  if (secondary_gardener_id) {
    const secCheck = await checkGardenerUsable(supabase, secondary_gardener_id);
    if (!secCheck.ok)
      return NextResponse.json({ error: secCheck.error }, { status: secCheck.status });
  }

  // Active slot count (informational in preview; all are re-pointed on commit).
  const { count: slotCount } = await supabase
    .from("service_slots")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("is_active", true);

  const future = await fetchFutureScheduledServices(supabase, customerId);

  // ─── Preview ───────────────────────────────────────────────────────────────
  if (!confirm) {
    const default_services = future
      .filter((s) => !s.gardener_customized)
      .map((s) => ({
        id: s.id,
        scheduled_date: s.scheduled_date,
        current_gardener_id: s.assigned_gardener_id,
      }));
    const customized_services = future
      .filter((s) => s.gardener_customized)
      .map((s) => ({
        id: s.id,
        scheduled_date: s.scheduled_date,
        current_gardener_id: s.assigned_gardener_id,
      }));

    return NextResponse.json({
      impact: {
        slot_count: slotCount ?? 0,
        default_services,
        customized_services,
      },
    });
  }

  // ─── Commit ──────────────────────────────────────────────────────────────────
  const futureIds = new Set(future.map((s) => s.id));
  const defaultIds = future.filter((s) => !s.gardener_customized).map((s) => s.id);
  const customizedIds = new Set(future.filter((s) => s.gardener_customized).map((s) => s.id));

  // The set to apply the new primary to. Defaults to all default (non-customized)
  // services; otherwise the explicit set, scoped to this customer's future
  // scheduled services (silently ignoring any stale/foreign ids).
  const requested = apply_service_ids ?? defaultIds;
  const applyIds = requested.filter((sid) => futureIds.has(sid));

  // 1. Update customer canonical assignment.
  const { error: updCustErr } = await supabase
    .from("customers")
    .update({
      primary_gardener_id,
      secondary_gardener_id: secondary_gardener_id,
    })
    .eq("id", customerId);
  if (updCustErr) return NextResponse.json({ error: updCustErr.message }, { status: 500 });

  // 2. Re-point all active slots (keeps slot.gardener_id == primary invariant).
  let updatedSlotCount = 0;
  try {
    updatedSlotCount = await repointActiveSlots(supabase, customerId, primary_gardener_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 3. Apply primary (+ secondary junction) to the selected services.
  try {
    await applyGardenersToServices(
      supabase,
      applyIds,
      primary_gardener_id,
      secondary_gardener_id,
      auth.userId
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 4. Deselected default services → flag customized (so future changes skip them too).
  const applySet = new Set(applyIds);
  const deselectedDefaults = defaultIds.filter((sid) => !applySet.has(sid));
  if (deselectedDefaults.length > 0) {
    await supabase
      .from("service_visits")
      .update({ gardener_customized: true })
      .in("id", deselectedDefaults);
  }

  // 5. Force-included customized services → clear the flag (they follow default again).
  const forceIncludedCustomized = applyIds.filter((sid) => customizedIds.has(sid));
  if (forceIncludedCustomized.length > 0) {
    await supabase
      .from("service_visits")
      .update({ gardener_customized: false })
      .in("id", forceIncludedCustomized);
  }

  const updatedServiceCount = applyIds.length;
  const skippedServiceCount = future.length - updatedServiceCount;

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.primary_gardener_changed",
    targetTable: "customers",
    targetId: customerId,
    metadata: {
      old_primary_gardener_id: customer.primary_gardener_id,
      new_primary_gardener_id: primary_gardener_id,
      old_secondary_gardener_id: customer.secondary_gardener_id,
      new_secondary_gardener_id: secondary_gardener_id,
      applied_count: updatedServiceCount,
      skipped_count: skippedServiceCount,
      deselected_defaults: deselectedDefaults.length,
      force_included_customized: forceIncludedCustomized.length,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({
    updated_service_count: updatedServiceCount,
    skipped_service_count: skippedServiceCount,
    slot_count: updatedSlotCount,
  });
}
