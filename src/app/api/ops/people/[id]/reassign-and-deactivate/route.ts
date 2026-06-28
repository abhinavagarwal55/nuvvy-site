import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import {
  resolveGardenerId,
  computeDeactivationImpact,
  checkGardenerUsable,
  applyGardenersToServices,
  repointActiveSlots,
  today,
} from "@/lib/services/gardener-assignment";

const BodySchema = z.object({
  reassignments: z
    .array(
      z.object({
        customer_id: z.string().uuid(),
        new_primary_gardener_id: z.string().uuid().optional(),
        // undefined = keep current secondary; null = clear it.
        new_secondary_gardener_id: z.string().uuid().nullable().optional(),
      })
    )
    .default([]),
  confirm: z.boolean().default(false),
});

// POST /api/ops/people/[id]/reassign-and-deactivate — admin only.
// [id] is a profiles.id. Reassigns every reference off the leaving gardener
// (ignoring gardener_customized), then flips the profile to inactive. Aborts 409
// if any reference would remain.
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
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: profileId } = await params;

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
  const { reassignments, confirm } = parsed.data;

  const supabase = getSupabaseAdmin();

  const leavingGardenerId = await resolveGardenerId(supabase, profileId);
  if (!leavingGardenerId) {
    return NextResponse.json({ error: "This person is not a gardener" }, { status: 400 });
  }

  const impact = await computeDeactivationImpact(supabase, leavingGardenerId);

  // Every customer where the gardener is primary or secondary must be reassigned.
  const reassignMap = new Map(reassignments.map((r) => [r.customer_id, r]));
  const impactedIds = [
    ...impact.primary_customers.map((c) => c.id),
    ...impact.secondary_customers.map((c) => c.id),
  ];
  const missing = impactedIds.filter((cid) => !reassignMap.has(cid));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "All impacted customers must be reassigned", missing_customer_ids: missing },
      { status: 400 }
    );
  }

  // Resolve + validate each reassignment into concrete {primary, secondary}.
  type Resolved = { customer_id: string; primary: string; secondary: string | null };
  const resolved: Resolved[] = [];
  for (const r of reassignments) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, primary_gardener_id, secondary_gardener_id")
      .eq("id", r.customer_id)
      .maybeSingle();
    if (!cust) {
      return NextResponse.json(
        { error: `Customer ${r.customer_id} not found` },
        { status: 404 }
      );
    }

    const primary = r.new_primary_gardener_id ?? cust.primary_gardener_id;
    const secondary =
      r.new_secondary_gardener_id !== undefined
        ? r.new_secondary_gardener_id
        : cust.secondary_gardener_id;

    if (!primary) {
      return NextResponse.json(
        { error: `Customer ${r.customer_id} needs a replacement primary gardener` },
        { status: 400 }
      );
    }
    if (primary === leavingGardenerId || secondary === leavingGardenerId) {
      return NextResponse.json(
        { error: `Replacement for customer ${r.customer_id} still references the leaving gardener` },
        { status: 409 }
      );
    }
    if (secondary && secondary === primary) {
      return NextResponse.json(
        { error: `Customer ${r.customer_id}: secondary must differ from primary` },
        { status: 409 }
      );
    }

    const pCheck = await checkGardenerUsable(supabase, primary);
    if (!pCheck.ok)
      return NextResponse.json({ error: pCheck.error }, { status: pCheck.status });
    if (secondary) {
      const sCheck = await checkGardenerUsable(supabase, secondary);
      if (!sCheck.ok)
        return NextResponse.json({ error: sCheck.error }, { status: sCheck.status });
    }

    resolved.push({ customer_id: r.customer_id, primary, secondary });
  }

  // Preview — validated, nothing written.
  if (!confirm) {
    return NextResponse.json({
      preview: true,
      impact,
      reassignments: resolved,
    });
  }

  // ─── Execute ─────────────────────────────────────────────────────────────────
  // 1. Apply each customer's new {primary, secondary}: customer row + active slots.
  for (const r of resolved) {
    const { error: updErr } = await supabase
      .from("customers")
      .update({ primary_gardener_id: r.primary, secondary_gardener_id: r.secondary })
      .eq("id", r.customer_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    try {
      await repointActiveSlots(supabase, r.customer_id, r.primary);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // 2. Sweep every future scheduled service still referencing the leaving
  //    gardener (assigned OR junction co-visit), regardless of gardener_customized,
  //    and re-point it to its customer's now-current {primary, secondary}.
  try {
    await sweepLeavingGardener(supabase, leavingGardenerId, auth.userId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // 3. Re-verify ZERO references remain before flipping status.
  const after = await computeDeactivationImpact(supabase, leavingGardenerId);
  const { count: activeSlotCount } = await supabase
    .from("service_slots")
    .select("id", { count: "exact", head: true })
    .eq("gardener_id", leavingGardenerId)
    .eq("is_active", true);

  if (
    after.primary_customers.length > 0 ||
    after.secondary_customers.length > 0 ||
    after.future_service_count > 0 ||
    (activeSlotCount ?? 0) > 0
  ) {
    return NextResponse.json(
      {
        error: "Gardener still has references after reassignment; aborting deactivation",
        remaining: { ...after, active_slot_count: activeSlotCount ?? 0 },
      },
      { status: 409 }
    );
  }

  // 4. Flip status to inactive (mirror is_active on gardeners).
  const inactiveSince = today();
  const { error: statusErr } = await supabase
    .from("profiles")
    .update({ status: "inactive", inactive_since: inactiveSince })
    .eq("id", profileId);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  await supabase
    .from("gardeners")
    .update({ is_active: false })
    .eq("profile_id", profileId);

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "gardener.reassigned_and_deactivated",
    targetTable: "profiles",
    targetId: profileId,
    metadata: {
      leaving_gardener_id: leavingGardenerId,
      reassignments: resolved,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: { ok: true, status: "inactive", reassigned_customers: resolved.length },
  });
}

/**
 * Move every future scheduled service that still references `leavingGardenerId`
 * (as assigned_gardener_id or as a junction co-visit member) onto its customer's
 * current {primary, secondary}. Ignores gardener_customized by design.
 */
async function sweepLeavingGardener(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  leavingGardenerId: string,
  actorUserId: string
): Promise<void> {
  const t = today();

  // Collect future scheduled service ids referencing the leaving gardener.
  const ids = new Set<string>();

  const { data: assigned } = await supabase
    .from("service_visits")
    .select("id")
    .eq("assigned_gardener_id", leavingGardenerId)
    .eq("status", "scheduled")
    .gte("scheduled_date", t);
  for (const r of assigned ?? []) ids.add(r.id);

  const { data: junction } = await supabase
    .from("service_visit_gardeners")
    .select("service_id")
    .eq("gardener_id", leavingGardenerId);
  const junctionIds = (junction ?? []).map((r) => r.service_id);
  if (junctionIds.length > 0) {
    const { data: junctionFuture } = await supabase
      .from("service_visits")
      .select("id")
      .in("id", junctionIds)
      .eq("status", "scheduled")
      .gte("scheduled_date", t);
    for (const r of junctionFuture ?? []) ids.add(r.id);
  }

  if (ids.size === 0) return;

  // Resolve each service's customer, then batch by customer to reuse that
  // customer's current {primary, secondary}.
  const { data: svcRows } = await supabase
    .from("service_visits")
    .select("id, customer_id")
    .in("id", Array.from(ids));

  const byCustomer = new Map<string, string[]>();
  for (const s of svcRows ?? []) {
    const list = byCustomer.get(s.customer_id) ?? [];
    list.push(s.id);
    byCustomer.set(s.customer_id, list);
  }

  for (const [customerId, serviceIds] of byCustomer) {
    const { data: cust } = await supabase
      .from("customers")
      .select("primary_gardener_id, secondary_gardener_id")
      .eq("id", customerId)
      .maybeSingle();
    const primary = cust?.primary_gardener_id;
    if (!primary || primary === leavingGardenerId) {
      // No safe target — leave it; re-verify will catch and abort.
      continue;
    }
    await applyGardenersToServices(
      supabase,
      serviceIds,
      primary,
      cust?.secondary_gardener_id ?? null,
      actorUserId
    );
  }
}
