import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isGardenerAssignedToService } from "@/lib/auth/service-access";
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

  // Fetch service
  const { data: service, error } = await supabase
    .from("service_visits")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Access check for gardeners — primary OR secondary (junction) can view.
  if (
    auth.role === "gardener" &&
    (!auth.gardener_id ||
      !(await isGardenerAssignedToService(supabase, id, auth.gardener_id, service.assigned_gardener_id)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch gardener name if assigned (name lives in profiles, not gardeners)
  let gardener: { id: string; name: string } | null = null;
  if (service.assigned_gardener_id) {
    const { data: g } = await supabase
      .from("gardeners")
      .select("id, profile_id")
      .eq("id", service.assigned_gardener_id)
      .single();
    if (g?.profile_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", g.profile_id)
        .single();
      gardener = { id: g.id, name: profile?.full_name ?? "Unknown" };
    } else if (g) {
      gardener = { id: g.id, name: "Unknown" };
    }
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
    supabase.from("customers").select("id, name, phone_number, unit_number, societies(name)").eq("id", service.customer_id).single(),
    supabase
      // JOIN the template so we pick up label_hi/label_kn — the snapshot holds
      // English only (history is never rewritten). Falls back to the snapshot
      // English label when template_item_id is null (template row deleted).
      .from("visit_checklist_items")
      .select(
        "id, label, is_required, order_index, is_completed, completion_status, notes, template_item_id, checklist_template_items(label_hi, label_kn)"
      )
      .eq("visit_id", id)
      .order("order_index"),
    supabase
      .from("service_special_tasks")
      .select("id, description, description_hi, description_kn, translation_status, is_completed")
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

  // Get care action type names from cache (incl. localised display variants).
  const allCareTypes = await getCachedCareActionTypes();
  const careTypeNames: Record<
    string,
    { name: string; freq: number; display: string; display_hi: string | null; display_kn: string | null }
  > = Object.fromEntries(
    allCareTypes.map((t) => [
      t.id,
      {
        name: t.name,
        freq: t.default_frequency_days,
        // Fall back to the slug if display_name was never set.
        display: t.display_name ?? t.name,
        display_hi: t.display_name_hi,
        display_kn: t.display_name_kn,
      },
    ])
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

  // Normalise every checklist row to a flat { label, label_hi, label_kn } shape.
  // For snapshot rows the variants come from the joined template; the snapshot's
  // own `label` is the English canonical (and the fallback).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flattenTemplate = (row: any) => {
    const tpl = row.checklist_template_items;
    const t = Array.isArray(tpl) ? tpl[0] : tpl;
    return {
      id: row.id,
      label: row.label,
      label_hi: t?.label_hi ?? null,
      label_kn: t?.label_kn ?? null,
      is_required: row.is_required,
      order_index: row.order_index,
      is_completed: row.is_completed,
      completion_status: row.completion_status,
      notes: row.notes,
    };
  };

  // For scheduled services with no checklist yet, return the template as a preview.
  let finalChecklist = (checklistItems ?? []).map(flattenTemplate);
  if (finalChecklist.length === 0 && service.status === "scheduled") {
    const { data: templates } = await supabase
      .from("checklist_template_items")
      .select("id, label, label_hi, label_kn, is_required, order_index, category")
      .eq("is_active", true)
      .order("order_index");
    finalChecklist = (templates ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      label_hi: t.label_hi ?? null,
      label_kn: t.label_kn ?? null,
      is_required: t.is_required,
      order_index: t.order_index,
      is_completed: false,
      completion_status: "pending",
      notes: null,
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responseData: Record<string, any> = {
    ...service,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          phone_number: customer.phone_number,
          unit_number: customer.unit_number ?? null,
          society_name:
            (customer.societies as unknown as { name: string } | null)?.name ?? null,
        }
      : null,
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
      care_actions_due: dueCareActions.map((ca) => {
        const info = careTypeNames[ca.care_action_type_id];
        return {
          care_schedule_id: ca.id,
          care_action_type_id: ca.care_action_type_id,
          // English canonical display + hi/kn variants (client pickVariant).
          care_action_name: info?.display ?? "Unknown",
          care_action_name_hi: info?.display_hi ?? null,
          care_action_name_kn: info?.display_kn ?? null,
          frequency_days: info?.freq ?? 0,
          next_due_date: ca.next_due_date,
          is_done: doneActionTypes.has(ca.care_action_type_id),
        };
      }),
      care_actions_performed: await (async () => {
        // For completed services, show what was actually done (not what's currently due)
        if (!existingCareActions || existingCareActions.length === 0) return [];
        return (existingCareActions ?? []).map((a) => {
          const info = careTypeNames[a.care_action_type_id];
          return {
            care_action_type_id: a.care_action_type_id,
            care_action_name: info?.display ?? "Unknown",
            care_action_name_hi: info?.display_hi ?? null,
            care_action_name_kn: info?.display_kn ?? null,
            marked_done: a.marked_done,
          };
        });
      })(),
    };
  responseData.gardener = gardener;

  return NextResponse.json({ data: responseData });
}
