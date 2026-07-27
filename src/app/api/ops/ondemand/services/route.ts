import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { getActiveOnDemandPlan, seedOnDemandChecklist } from "@/lib/services/ondemand";

const CreateServiceSchema = z.object({
  customer_id: z.string().uuid(),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "service_date must be YYYY-MM-DD"),
  service_time: z.string().regex(/^\d{2}:\d{2}$/, "service_time must be HH:MM"),
  estimated_hours: z.number().positive("estimated_hours must be > 0"),
  plan_id: z.string().uuid(),
  assigned_gardener_id: z.string().uuid(),
  special_tasks: z.string().nullish(),
});

// POST /api/ops/ondemand/services — create a one-off on-demand service.
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
  const parsed = CreateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // service_date cannot be in the past (server/UTC day).
  const today = new Date().toISOString().split("T")[0];
  if (d.service_date < today) {
    return NextResponse.json({ error: "service_date cannot be in the past" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Customer must exist and be on-demand.
  const { data: customer } = await supabase
    .from("customers")
    .select("id, customer_type")
    .eq("id", d.customer_id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.customer_type !== "ondemand") {
    return NextResponse.json({ error: "Customer is not an on-demand customer" }, { status: 400 });
  }

  // Plan must be an active on-demand plan.
  const planResult = await getActiveOnDemandPlan(supabase, d.plan_id);
  if (!planResult.ok) {
    return NextResponse.json({ error: planResult.error }, { status: planResult.status });
  }

  // Gardener must exist and be active.
  const { data: gardener } = await supabase
    .from("gardeners")
    .select("id, is_active")
    .eq("id", d.assigned_gardener_id)
    .maybeSingle();
  if (!gardener) return NextResponse.json({ error: "Gardener not found" }, { status: 404 });
  if (!gardener.is_active) {
    return NextResponse.json({ error: "Gardener is inactive" }, { status: 400 });
  }

  const { data: service, error } = await supabase
    .from("service_visits")
    .insert({
      customer_id: d.customer_id,
      assigned_gardener_id: d.assigned_gardener_id,
      subscription_id: null,
      plan_id: d.plan_id,
      scheduled_date: d.service_date,
      time_window_start: d.service_time,
      estimated_hours: d.estimated_hours,
      special_tasks: d.special_tasks ?? null,
      is_one_off: true,
      status: "scheduled",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror the assignment into the junction table (matches /services/create).
  await supabase.from("service_visit_gardeners").insert({
    service_id: service.id,
    gardener_id: d.assigned_gardener_id,
    assigned_by: auth.userId,
  });

  // Seed checklist now (standard items + forced fertilizer + neem).
  await seedOnDemandChecklist(supabase, service.id);

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "service.created",
    targetTable: "service_visits",
    targetId: service.id,
    metadata: {
      is_one_off: true,
      ondemand: true,
      customer_id: d.customer_id,
      plan_id: d.plan_id,
      estimated_hours: d.estimated_hours,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: service }, { status: 201 });
}

// GET /api/ops/ondemand/services?customer_id=:id — list on-demand services.
export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id");

  const supabase = getSupabaseAdmin();
  // On-demand services are the ones carrying an on-demand plan (per-hour).
  let query = supabase
    .from("service_visits")
    .select(
      "id, customer_id, scheduled_date, time_window_start, estimated_hours, actual_hours_spent, status, special_tasks, plan_id, assigned_gardener_id, completed_at, created_at, service_plans!inner(id, name, hourly_rate, plan_type)"
    )
    .eq("service_plans.plan_type", "ondemand")
    .order("scheduled_date", { ascending: false })
    .limit(200);

  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
