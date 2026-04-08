import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const Schema = z.object({
  completion_status: z.enum(["pending", "done", "not_required"]),
});

// PATCH /api/ops/services/[id]/checklist/[itemId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const { id, itemId } = await params;
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Verify service access
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, assigned_gardener_id, status")
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

  const isDone = parsed.data.completion_status === "done";

  const { data, error } = await supabase
    .from("visit_checklist_items")
    .update({
      completion_status: parsed.data.completion_status,
      is_completed: isDone,
      completed_at: isDone ? new Date().toISOString() : null,
      completed_by: isDone ? auth.userId : null,
    })
    .eq("id", itemId)
    .eq("visit_id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
