import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

// POST /api/ops/services/[id]/start — set started_at, status = in_progress
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

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Gardener can only start their own services
  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (service.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot start: status is ${service.status}` },
      { status: 400 }
    );
  }

  // Generate checklist items from template if none exist yet
  const { count } = await supabase
    .from("visit_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", id);

  if ((count ?? 0) === 0) {
    const { data: templates } = await supabase
      .from("checklist_template_items")
      .select("id, label, is_required, order_index, category")
      .eq("is_active", true)
      .order("order_index");

    if (templates && templates.length > 0) {
      const rows = templates.map((t) => ({
        visit_id: id,
        template_item_id: t.id,
        label: t.label,
        is_required: t.is_required,
        order_index: t.order_index,
        is_completed: false,
        completion_status: "pending",
      }));

      await supabase.from("visit_checklist_items").insert(rows);
    }
  }

  const { data, error } = await supabase
    .from("service_visits")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
