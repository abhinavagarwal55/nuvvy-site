import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { withPerfLog } from "@/lib/perf/with-perf-log";
import { PerfContext } from "@/lib/perf/perf-context";

// GET /api/ops/customers/[id] — customer 360 data
export const GET = withPerfLog('/api/ops/customers/[id]', async (request: NextRequest, ctx: PerfContext, routeParams: unknown) => {
  let auth;
  try {
    auth = await ctx.trackAuth(() => requireOpsAuth(request));
  } catch (res) {
    return res as Response;
  }
  ctx.setUser(auth.userId, auth.role);
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await (routeParams as { params: Promise<{ id: string }> }).params;
  const supabase = getSupabaseAdmin();

  // Round 1: customer with society via FK join
  const { data: customer, error } = await ctx.trackQuery(async () => supabase
    .from("customers")
    .select("*, societies(id, name)")
    .eq("id", id)
    .single());

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Round 2: all related data in parallel (with FK joins to eliminate sequential lookups)
  const [
    { data: observations },
    { data: subscription },
    { data: careSchedules },
  ] = await ctx.trackQuery(async () => Promise.all([
    supabase
      .from("customer_observations")
      .select("id, text, created_by, updated_at")
      .eq("customer_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("id, plan_id, start_date, end_date, status, service_plans(id, name, visit_frequency, price)")
      .eq("customer_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("customer_care_schedules")
      .select(
        "id, care_action_type_id, cycle_anchor_date, next_due_date, last_done_date, care_action_types(id, name)"
      )
      .eq("customer_id", id),
  ]));

  // Extract society from joined result
  const societyObj = customer.societies as unknown as { id: string; name: string } | null;

  // Extract plan from joined subscription
  const planInfo = subscription
    ? (subscription.service_plans as unknown as { id: string; name: string; visit_frequency: string; price: number } | null)
    : null;

  return NextResponse.json({
    data: {
      ...customer,
      societies: undefined, // remove raw join field
      society: societyObj ?? null,
      observations: observations ?? [],
      subscription: subscription
        ? { id: subscription.id, plan_id: subscription.plan_id, start_date: subscription.start_date, end_date: subscription.end_date, status: subscription.status, plan: planInfo }
        : null,
      care_schedules: (careSchedules ?? []).map((cs) => {
        const typeObj = cs.care_action_types as unknown as { id: string; name: string } | null;
        return {
          id: cs.id,
          care_action_type_id: cs.care_action_type_id,
          cycle_anchor_date: cs.cycle_anchor_date,
          next_due_date: cs.next_due_date,
          last_done_date: cs.last_done_date,
          care_action_name: typeObj?.name ?? null,
        };
      }),
    },
  });
});

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

// DELETE /api/ops/customers/[id] — delete a DRAFT customer only
export async function DELETE(
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

  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (customer.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only draft customers can be deleted" },
      { status: 400 }
    );
  }

  // Delete related data first
  await Promise.all([
    supabase.from("customer_observations").delete().eq("customer_id", id),
    supabase.from("customer_photos").delete().eq("customer_id", id),
    supabase.from("customer_care_schedules").delete().eq("customer_id", id),
  ]);

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.deleted",
    targetTable: "customers",
    targetId: id,
    metadata: { status: "DRAFT" },
    ip: request.headers.get("x-forwarded-for") || null,
    userAgent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ ok: true });
}
