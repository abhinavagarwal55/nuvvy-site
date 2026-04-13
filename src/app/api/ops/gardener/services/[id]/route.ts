import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { getCachedCareActionTypes } from "@/lib/cache/reference-data";

// GET /api/ops/gardener/services/[id] — full service detail for execution screen
export async function GET(
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
  const today = new Date().toISOString().split("T")[0];

  // Fetch service with gardener join
  const { data: serviceRaw, error } = await supabase
    .from("service_visits")
    .select("*, gardeners(id, name)")
    .eq("id", id)
    .single();

  if (error || !serviceRaw) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Extract gardener from join, then remove the joined field
  const gardener = (serviceRaw.gardeners as unknown as { id: string; name: string } | null) ?? null;
  const { gardeners: _g, ...service } = serviceRaw;
  void _g;

  // Access check for gardeners
  if (auth.role === "gardener" && service.assigned_gardener_id !== auth.gardener_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch related data in parallel
  const [
    { data: customer },
    { data: checklistItems },
    { data: specialTasks },
    { data: photos },
    { data: voiceNotes },
    { data: careSchedules },
  ] = await Promise.all([
    supabase.from("customers").select("id, name, phone_number").eq("id", service.customer_id).single(),
    supabase
      .from("visit_checklist_items")
      .select("id, label, is_required, order_index, is_completed, completion_status, notes")
      .eq("visit_id", id)
      .order("order_index"),
    supabase
      .from("service_special_tasks")
      .select("id, description, is_completed")
      .eq("for_service_id", id),
    supabase
      .from("visit_photos")
      .select("id, storage_path, tag, caption")
      .eq("visit_id", id),
    supabase
      .from("service_voice_notes")
      .select("id, storage_path")
      .eq("service_id", id),
    supabase
      .from("customer_care_schedules")
      .select("id, care_action_type_id, next_due_date, last_done_date, cycle_anchor_date")
      .eq("customer_id", service.customer_id),
  ]);

  // Filter care actions that are due by the service's scheduled date (or today, whichever is later)
  const dueBy = service.scheduled_date > today ? service.scheduled_date : today;
  const dueCareActions = (careSchedules ?? []).filter(
    (cs) => cs.next_due_date && cs.next_due_date <= dueBy
  );

  // Get care action type names from cache
  const allCareTypes = await getCachedCareActionTypes();
  const careTypeNames: Record<string, { name: string; freq: number }> = Object.fromEntries(
    allCareTypes.map((t) => [t.id, { name: t.name, freq: t.default_frequency_days }])
  );

  // Check which care actions have already been marked done for this service
  const { data: existingCareActions } = await supabase
    .from("service_care_actions")
    .select("care_action_type_id, marked_done")
    .eq("service_id", id);

  const doneActionTypes = new Set(
    (existingCareActions ?? [])
      .filter((a) => a.marked_done)
      .map((a) => a.care_action_type_id)
  );

  // For scheduled services with no checklist yet, return the template as a preview
  let finalChecklist = checklistItems ?? [];
  if (finalChecklist.length === 0 && service.status === "scheduled") {
    const { data: templates } = await supabase
      .from("checklist_template_items")
      .select("id, label, is_required, order_index, category")
      .eq("is_active", true)
      .order("order_index");
    finalChecklist = (templates ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      is_required: t.is_required,
      order_index: t.order_index,
      is_completed: false,
      completion_status: "pending",
      notes: null,
    }));
  }

  return NextResponse.json({
    data: {
      ...service,
      gardener: gardener,
      customer: customer ?? null,
      checklist_items: finalChecklist,
      special_tasks: specialTasks ?? [],
      photo_count: (photos ?? []).length,
      photos: await Promise.all(
        (photos ?? []).map(async (p) => {
          const { data: urlData } = await supabase.storage
            .from("nuvvy-ops")
            .createSignedUrl(p.storage_path, 3600);
          return { ...p, signed_url: urlData?.signedUrl ?? null };
        })
      ),
      voice_note_count: (voiceNotes ?? []).length,
      care_actions_due: dueCareActions.map((ca) => ({
        care_schedule_id: ca.id,
        care_action_type_id: ca.care_action_type_id,
        care_action_name: careTypeNames[ca.care_action_type_id]?.name ?? "Unknown",
        frequency_days: careTypeNames[ca.care_action_type_id]?.freq ?? 0,
        next_due_date: ca.next_due_date,
        is_done: doneActionTypes.has(ca.care_action_type_id),
      })),
      care_actions_performed: await (async () => {
        // For completed services, show what was actually done (not what's currently due)
        if (!existingCareActions || existingCareActions.length === 0) return [];
        const performedTypeIds = (existingCareActions ?? []).map((a) => a.care_action_type_id);
        const { data: perfTypes } = await supabase
          .from("care_action_types")
          .select("id, name")
          .in("id", performedTypeIds);
        const typeMap = Object.fromEntries((perfTypes ?? []).map((t) => [t.id, t.name]));
        return (existingCareActions ?? []).map((a) => ({
          care_action_type_id: a.care_action_type_id,
          care_action_name: typeMap[a.care_action_type_id] ?? "Unknown",
          marked_done: a.marked_done,
        }));
      })(),
    },
  });
}
