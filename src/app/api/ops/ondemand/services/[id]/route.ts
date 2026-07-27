import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { isGardenerAssignedToService } from "@/lib/auth/service-access";
import { logAuditEvent } from "@/lib/services/audit";
import { upsertOnDemandBill } from "@/lib/services/ondemand";

type PlanJoin = { id: string; name: string; hourly_rate: number | null; plan_type: string } | null;

// GET /api/ops/ondemand/services/:id — on-demand service detail.
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

  const { data: service, error } = await supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, estimated_hours, actual_hours_spent, status, special_tasks, assigned_gardener_id, completed_at, created_at, service_plans(id, name, hourly_rate, plan_type)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  // Gardener may only view services they're assigned to.
  if (
    auth.role === "gardener" &&
    (!auth.gardener_id ||
      !(await isGardenerAssignedToService(supabase, id, auth.gardener_id, service.assigned_gardener_id)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = service.service_plans as unknown as PlanJoin;

  // Assigned gardener name (via profile).
  let gardener: { id: string; name: string } | null = null;
  if (service.assigned_gardener_id) {
    const { data: g } = await supabase
      .from("gardeners")
      .select("id, profile_id")
      .eq("id", service.assigned_gardener_id)
      .maybeSingle();
    if (g) {
      let name = "Unknown";
      if (g.profile_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", g.profile_id)
          .maybeSingle();
        name = p?.full_name ?? "Unknown";
      }
      gardener = { id: g.id, name };
    }
  }

  const { data: checklist } = await supabase
    .from("visit_checklist_items")
    .select("id, label, is_required, is_completed, completion_status, order_index")
    .eq("visit_id", id)
    .order("order_index");

  return NextResponse.json({
    data: {
      id: service.id,
      customer_id: service.customer_id,
      service_date: service.scheduled_date,
      service_time: service.time_window_start,
      estimated_hours: service.estimated_hours,
      actual_hours_spent: service.actual_hours_spent,
      plan: plan ? { id: plan.id, name: plan.name, hourly_rate: plan.hourly_rate } : null,
      assigned_gardener: gardener,
      status: service.status,
      special_tasks: service.special_tasks,
      checklist: checklist ?? [],
      created_at: service.created_at,
      completed_at: service.completed_at,
    },
  });
}

const PatchServiceSchema = z.object({
  actual_hours_spent: z.number().positive("actual_hours_spent must be > 0").optional(),
  status: z.enum(["in_progress", "completed", "not_completed"]).optional(),
  not_completed_reason: z.string().optional(),
  special_tasks: z.string().nullish(),
  // When actual_hours_spent exceeds 2× the estimate, the caller must re-submit
  // with this flag to confirm (soft cap).
  override_soft_cap: z.boolean().optional(),
});

// PATCH /api/ops/ondemand/services/:id — gardener logs hours + completes;
// horti/admin edits hours or special tasks.
export async function PATCH(
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
  const body = await request.json();
  const parsed = PatchServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: service } = await supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, status, estimated_hours, actual_hours_spent, assigned_gardener_id, service_plans(id, hourly_rate, plan_type)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const plan = service.service_plans as unknown as PlanJoin;
  if (!plan || plan.plan_type !== "ondemand") {
    return NextResponse.json({ error: "Not an on-demand service" }, { status: 400 });
  }

  const isGardener = auth.role === "gardener";
  if (
    isGardener &&
    (!auth.gardener_id ||
      !(await isGardenerAssignedToService(supabase, id, auth.gardener_id, service.assigned_gardener_id)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  let hoursChanged = false;
  const prevHours = service.actual_hours_spent as number | null;

  if (d.actual_hours_spent !== undefined) {
    // Soft cap: > 2× estimate requires explicit override.
    const est = service.estimated_hours as number | null;
    if (est && d.actual_hours_spent > est * 2 && !d.override_soft_cap) {
      return NextResponse.json(
        {
          error: `Actual hours (${d.actual_hours_spent}) exceed 2× the estimate (${est}). Re-submit with override_soft_cap to confirm.`,
          soft_cap_exceeded: true,
        },
        { status: 400 }
      );
    }
    update.actual_hours_spent = d.actual_hours_spent;
    hoursChanged = d.actual_hours_spent !== prevHours;
  }

  if (d.status) {
    update.status = d.status;
    if (d.status === "completed") update.completed_at = new Date().toISOString();
    if (d.status === "not_completed" && d.not_completed_reason) {
      update.not_completed_reason = d.not_completed_reason;
    }
  }

  // special_tasks is an ops-only edit.
  if (d.special_tasks !== undefined && !isGardener) {
    update.special_tasks = d.special_tasks ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("service_visits")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  if (hoursChanged) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "service.actual_hours_updated",
      targetTable: "service_visits",
      targetId: id,
      metadata: { from: prevHours, to: d.actual_hours_spent },
      ip,
      userAgent,
    });
  }

  const nowCompleted = (updated.status as string) === "completed";
  const finalHours = updated.actual_hours_spent as number | null;

  let bill: (Record<string, unknown> & { id: string }) | null = null;

  // Bill auto-generation / recalc: only for completed services with hours.
  if (nowCompleted && finalHours != null) {
    const billResult = await upsertOnDemandBill(
      supabase,
      {
        id: service.id,
        customer_id: service.customer_id,
        actual_hours_spent: finalHours,
        hourly_rate: plan.hourly_rate ?? 0,
      },
      auth.userId
    );

    if (billResult.action === "error") {
      // Don't fail the whole PATCH — the service update already committed.
      return NextResponse.json(
        { data: updated, warning: `Bill generation failed: ${billResult.error}` },
        { status: 200 }
      );
    }
    if (billResult.action !== "skipped_paid") {
      bill = billResult.bill;
      logAuditEvent({
        actorId: auth.userId,
        actorRole: auth.role,
        action: billResult.action === "created" ? "bill.created" : "bill.updated",
        targetTable: "bills",
        targetId: billResult.bill.id,
        metadata: {
          service_visit_id: id,
          amount_inr: billResult.bill.amount_inr,
          actual_hours_spent: finalHours,
        },
        ip,
        userAgent,
      });
    }

    // Fertilizer + neem are always applied on an on-demand visit — stamp the
    // customer with the service date on completion.
    await supabase
      .from("customers")
      .update({
        last_fertilizer_applied_at: service.scheduled_date,
        last_neem_applied_at: service.scheduled_date,
      })
      .eq("id", service.customer_id);
  }

  return NextResponse.json({ data: updated, bill });
}
