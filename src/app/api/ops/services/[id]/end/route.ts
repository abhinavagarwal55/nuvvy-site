import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";

const IssueSchema = z.object({
  type: z.enum(["leaves_drooping", "pest_infected", "other"]),
  description: z.string().optional(),
  photo_ids: z.array(z.string().uuid()).optional(),
  communicated_to_customer: z.boolean().optional(),
});

const EndServiceSchema = z.object({
  checklist: z.array(
    z.object({
      id: z.string().uuid(),
      completion_status: z.enum(["done", "pending", "not_required"]),
    })
  ),
  care_actions_done: z.array(z.string().uuid()),
  special_tasks_done: z.array(z.string().uuid()),
  issues: z.array(IssueSchema).optional().default([]),
  has_client_request: z.boolean().optional(),
});

const ISSUE_LABELS: Record<string, string> = {
  leaves_drooping: "Leaves drooping",
  pest_infected: "Plant infected with pest",
  other: "Other issue",
};

// POST /api/ops/services/[id]/end — batch end-service (gardener flow)
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

  // Fetch service
  const { data: service } = await supabase
    .from("service_visits")
    .select("id, status, customer_id, assigned_gardener_id")
    .eq("id", id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (
    auth.role === "gardener" &&
    service.assigned_gardener_id !== auth.gardener_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (service.status !== "in_progress") {
    return NextResponse.json(
      { error: `Cannot end: status is ${service.status}` },
      { status: 400 }
    );
  }

  // Parse body
  const body = await request.json();
  const parsed = EndServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { checklist, care_actions_done, special_tasks_done, issues, has_client_request } =
    parsed.data;

  // Validate photo count >= 2 (general photos only)
  const { count: generalPhotoCount } = await supabase
    .from("visit_photos")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", id)
    .eq("tag", "general");

  if ((generalPhotoCount ?? 0) < 2) {
    return NextResponse.json(
      { error: "At least 2 wide-shot photos are required" },
      { status: 422 }
    );
  }

  // 1. Batch-update checklist items
  for (const item of checklist) {
    await supabase
      .from("visit_checklist_items")
      .update({ completion_status: item.completion_status })
      .eq("id", item.id)
      .eq("visit_id", id);
  }

  // 2. Upsert care actions
  for (const typeId of care_actions_done) {
    await supabase.from("service_care_actions").upsert(
      {
        service_id: id,
        care_action_type_id: typeId,
        was_due: true,
        marked_done: true,
        done_at: new Date().toISOString(),
      },
      { onConflict: "service_id,care_action_type_id" }
    );
  }

  // 3. Mark special tasks done
  for (const taskId of special_tasks_done) {
    await supabase
      .from("service_special_tasks")
      .update({ is_completed: true })
      .eq("id", taskId)
      .eq("for_service_id", id);
  }

  // 4. Create issue requests — one per selected issue type
  let issueRaised = false;
  if (issues && issues.length > 0) {
    // Fetch issue photo paths once (shared across all issue requests)
    const allPhotoIds = issues.flatMap((i) => i.photo_ids ?? []);
    let issuePhotoRows: { storage_path: string }[] = [];
    if (allPhotoIds.length > 0) {
      const { data: photos } = await supabase
        .from("visit_photos")
        .select("storage_path")
        .in("id", allPhotoIds);
      issuePhotoRows = photos ?? [];
    }

    for (const issue of issues) {
      const description =
        issue.type === "other" && issue.description
          ? issue.description
          : ISSUE_LABELS[issue.type] ?? issue.type;

      const { data: req } = await supabase
        .from("requests")
        .insert({
          customer_id: service.customer_id,
          service_id: id,
          type: "problem",
          issue_type: issue.type,
          description,
          communicated_to_customer: issue.communicated_to_customer ?? false,
          status: "open",
          created_by: auth.userId,
        })
        .select("id")
        .single();

      // Link shared issue photos to each request
      if (req && issuePhotoRows.length > 0) {
        await supabase.from("request_photos").insert(
          issuePhotoRows.map((p) => ({
            request_id: req.id,
            storage_path: p.storage_path,
          }))
        );
      }
    }

    issueRaised = true;
  }

  // 5. Create client request if voice note was recorded
  let clientRequestRaised = false;
  if (has_client_request) {
    // Check if there is a voice note for this service
    const { data: voiceNote } = await supabase
      .from("service_voice_notes")
      .select("id, storage_path")
      .eq("service_id", id)
      .limit(1)
      .single();

    await supabase.from("requests").insert({
      customer_id: service.customer_id,
      service_id: id,
      type: "client_request",
      description: "Client request recorded via voice note during service visit",
      status: "open",
      created_by: auth.userId,
    });

    // Also copy voice note as request_voice_note if it exists
    if (voiceNote) {
      const { data: clientReq } = await supabase
        .from("requests")
        .select("id")
        .eq("service_id", id)
        .eq("type", "client_request")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (clientReq) {
        await supabase.from("request_voice_notes").insert({
          request_id: clientReq.id,
          storage_path: voiceNote.storage_path,
        });
      }
    }

    clientRequestRaised = true;
  }

  // 6. Update care schedules (anchored model)
  const { data: doneActions } = await supabase
    .from("service_care_actions")
    .select("care_action_type_id")
    .eq("service_id", id)
    .eq("marked_done", true);

  if (doneActions && doneActions.length > 0) {
    const today = new Date().toISOString().split("T")[0];

    for (const action of doneActions) {
      const { data: schedule } = await supabase
        .from("customer_care_schedules")
        .select("id, cycle_anchor_date")
        .eq("customer_id", service.customer_id)
        .eq("care_action_type_id", action.care_action_type_id)
        .single();

      const { data: actionType } = await supabase
        .from("care_action_types")
        .select("default_frequency_days")
        .eq("id", action.care_action_type_id)
        .single();

      if (schedule && actionType) {
        const anchor = new Date(schedule.cycle_anchor_date + "T00:00:00");
        const todayDate = new Date(today + "T00:00:00");
        const freq = actionType.default_frequency_days;
        const daysSinceAnchor = Math.floor(
          (todayDate.getTime() - anchor.getTime()) / 86400000
        );
        const periodsCompleted = Math.floor(daysSinceAnchor / freq) + 1;
        const nextDue = new Date(anchor);
        nextDue.setDate(nextDue.getDate() + periodsCompleted * freq);
        const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, "0")}-${String(nextDue.getDate()).padStart(2, "0")}`;

        await supabase
          .from("customer_care_schedules")
          .update({
            last_done_date: today,
            last_done_service_id: id,
            next_due_date: nextDueStr,
          })
          .eq("id", schedule.id);
      }
    }
  }

  // 7. Mark service completed
  const { data: updated, error } = await supabase
    .from("service_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: updated,
    issue_raised: issueRaised,
    client_request_raised: clientRequestRaised,
  });
}
