import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const Schema = z.object({
  plan_id: z.string().uuid("Plan is required"),
});

// POST /api/ops/customers/[id]/convert-to-subscription
// Converts an on-demand customer to a care-plan subscriber: flips customer_type,
// stamps converted_to_subscription_at, and provisions an active subscription.
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
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  const { data: customer } = await supabase
    .from("customers")
    .select("id, status, customer_type, converted_to_subscription_at")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.customer_type !== "ondemand") {
    return NextResponse.json({ error: "Only on-demand customers can be converted" }, { status: 400 });
  }
  if (customer.converted_to_subscription_at) {
    return NextResponse.json({ error: "Customer already converted" }, { status: 400 });
  }

  // Plan must be an active subscription plan.
  const { data: plan } = await supabase
    .from("service_plans")
    .select("id, plan_type, is_active")
    .eq("id", parsed.data.plan_id)
    .maybeSingle();
  if (!plan || !plan.is_active || plan.plan_type !== "subscription") {
    return NextResponse.json({ error: "Select an active subscription plan" }, { status: 400 });
  }

  // Provision the subscription.
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .insert({
      customer_id: id,
      plan_id: parsed.data.plan_id,
      start_date: today,
      status: "active",
    })
    .select("id")
    .single();
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  // Flip type + stamp conversion.
  const nowIso = new Date().toISOString();
  const { error: custErr } = await supabase
    .from("customers")
    .update({ customer_type: "care_plan", converted_to_subscription_at: nowIso })
    .eq("id", id);
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.converted_to_subscription",
    targetTable: "customers",
    targetId: id,
    metadata: { plan_id: parsed.data.plan_id, subscription_id: sub.id },
    ip,
    userAgent,
  });

  return NextResponse.json({ data: { subscription_id: sub.id } });
}
