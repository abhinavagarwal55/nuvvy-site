import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const CreateServiceSchema = z.object({
  customer_id: z.string().uuid(),
  gardener_id: z.string().uuid(),
  scheduled_date: z.string(), // YYYY-MM-DD
  time_window_start: z.string(), // HH:MM
  time_window_end: z.string(),
  is_one_off: z.boolean().optional().default(true),
});

// POST /api/ops/services/create — manually create a service visit
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

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  // Verify customer exists and is active
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", d.customer_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Get active subscription for the customer
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("customer_id", d.customer_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get active slot for the customer
  const { data: slot } = await supabase
    .from("service_slots")
    .select("id")
    .eq("customer_id", d.customer_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("service_visits")
    .insert({
      customer_id: d.customer_id,
      assigned_gardener_id: d.gardener_id,
      subscription_id: subscription?.id ?? null,
      slot_id: slot?.id ?? null,
      scheduled_date: d.scheduled_date,
      time_window_start: d.time_window_start,
      time_window_end: d.time_window_end,
      status: "scheduled",
      is_one_off: d.is_one_off,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "service.created",
    targetTable: "service_visits",
    targetId: data.id,
    metadata: { customer_id: d.customer_id, scheduled_date: d.scheduled_date, is_one_off: d.is_one_off },
    ip,
    userAgent,
  });

  return NextResponse.json({ data }, { status: 201 });
}
