import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const BulkReassignSchema = z.object({
  from_gardener_id: z.string().uuid(),
  to_gardener_id: z.string().uuid(),
  from_date: z.string(), // YYYY-MM-DD
  to_date: z.string().optional(), // if omitted → permanent (also updates slots)
  confirm: z.boolean().default(false), // false = preview, true = execute
});

// POST /api/ops/schedule/bulk-reassign
// Two modes:
//   confirm=false → returns count of services that would be affected (preview)
//   confirm=true  → executes the reassignment
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = BulkReassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { from_gardener_id, to_gardener_id, from_date, to_date, confirm } =
    parsed.data;

  if (from_gardener_id === to_gardener_id) {
    return NextResponse.json(
      { error: "Source and target gardener must be different" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Build query for affected services
  let query = supabase
    .from("service_visits")
    .select("id", { count: "exact" })
    .eq("assigned_gardener_id", from_gardener_id)
    .eq("status", "scheduled")
    .gte("scheduled_date", from_date);

  if (to_date) query = query.lte("scheduled_date", to_date);

  const { count, error: countErr } = await query;
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  if (!confirm) {
    // Preview mode
    return NextResponse.json({
      data: {
        affected_count: count ?? 0,
        from_date,
        to_date: to_date ?? "permanent",
      },
    });
  }

  // Execute reassignment
  let updateQuery = supabase
    .from("service_visits")
    .update({ assigned_gardener_id: to_gardener_id })
    .eq("assigned_gardener_id", from_gardener_id)
    .eq("status", "scheduled")
    .gte("scheduled_date", from_date);

  if (to_date) updateQuery = updateQuery.lte("scheduled_date", to_date);

  const { error: updateErr } = await updateQuery;
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If permanent (no to_date), also update active slots
  if (!to_date) {
    await supabase
      .from("service_slots")
      .update({ gardener_id: to_gardener_id })
      .eq("gardener_id", from_gardener_id)
      .eq("is_active", true);
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.bulk_reassigned",
    targetTable: "service_visits",
    targetId: "bulk",
    metadata: { from_gardener_id, to_gardener_id, count: count ?? 0, permanent: !to_date },
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: {
      reassigned_count: count ?? 0,
      permanent: !to_date,
    },
  });
}
