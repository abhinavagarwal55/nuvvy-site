import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// GET /api/ops/customers/[id] — customer 360 data
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
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Fetch customer
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data in parallel
  const [
    { data: observations },
    { data: subscription },
    { data: careSchedules },
    { data: society },
  ] = await Promise.all([
    supabase
      .from("customer_observations")
      .select("id, text, created_by, updated_at")
      .eq("customer_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("id, plan_id, start_date, end_date, status")
      .eq("customer_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("customer_care_schedules")
      .select(
        "id, care_action_type_id, cycle_anchor_date, next_due_date, last_done_date"
      )
      .eq("customer_id", id),
    customer.society_id
      ? supabase
          .from("societies")
          .select("id, name")
          .eq("id", customer.society_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  // If there's an active subscription, fetch the plan name
  let planInfo = null;
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("service_plans")
      .select("id, name, visit_frequency, price")
      .eq("id", subscription.plan_id)
      .single();
    planInfo = plan;
  }

  // Fetch care action type names for schedule display
  let careActionTypes: Record<string, string> = {};
  if (careSchedules && careSchedules.length > 0) {
    const typeIds = careSchedules.map((cs) => cs.care_action_type_id);
    const { data: types } = await supabase
      .from("care_action_types")
      .select("id, name")
      .in("id", typeIds);
    careActionTypes = Object.fromEntries(
      (types ?? []).map((t) => [t.id, t.name])
    );
  }

  return NextResponse.json({
    data: {
      ...customer,
      society: society ?? null,
      observations: observations ?? [],
      subscription: subscription
        ? { ...subscription, plan: planInfo }
        : null,
      care_schedules: (careSchedules ?? []).map((cs) => ({
        ...cs,
        care_action_name: careActionTypes[cs.care_action_type_id] ?? null,
      })),
    },
  });
}

const UpdateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  phone_number: z.string().min(1).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  address: z.string().optional(),
  society_id: z.string().uuid().nullable().optional(),
  plant_count_range: z
    .enum(["0_20", "20_40", "40_plus"])
    .nullable()
    .optional(),
  light_condition: z.string().nullable().optional(),
  watering_responsibility: z.array(z.string()).nullable().optional(),
  house_help_phone: z.string().nullable().optional(),
  garden_notes: z.string().nullable().optional(),
});

// PUT /api/ops/customers/[id] — update customer fields (not status)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.updated",
    targetTable: "customers",
    targetId: id,
    metadata: { fields_changed: Object.keys(updates) },
    ip,
    userAgent,
  });

  return NextResponse.json({ data });
}
