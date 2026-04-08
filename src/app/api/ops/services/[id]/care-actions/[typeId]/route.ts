import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// POST /api/ops/services/[id]/care-actions/[typeId] — mark care action done
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; typeId: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const { id, typeId } = await params;
  const supabase = getSupabaseAdmin();

  // Verify service
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, customer_id, assigned_gardener_id, status")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (service.status !== "in_progress") {
    return NextResponse.json(
      { error: "Service must be in progress" },
      { status: 400 }
    );
  }

  // Check if care schedule exists for this customer + type
  const { data: schedule } = await supabase
    .from("customer_care_schedules")
    .select("id, next_due_date")
    .eq("customer_id", service.customer_id)
    .eq("care_action_type_id", typeId)
    .single();

  const wasDue = schedule?.next_due_date
    ? schedule.next_due_date <= new Date().toISOString().split("T")[0]
    : false;

  // Upsert service_care_actions row
  const { data, error } = await supabase
    .from("service_care_actions")
    .upsert(
      {
        service_id: id,
        care_action_type_id: typeId,
        was_due: wasDue,
        marked_done: true,
        done_at: new Date().toISOString(),
      },
      { onConflict: "service_id,care_action_type_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
