import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// GET /api/ops/plans?active=true
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
  const activeOnly = searchParams.get("active");

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("service_plans")
    .select(
      "id, name, description, visit_frequency, visit_duration_minutes, price, billing_cycle, includes_fertilizer, includes_pest_control, is_active, created_at"
    )
    .order("created_at", { ascending: false });

  if (activeOnly === "true") {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

const CreatePlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  visit_frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  visit_duration_minutes: z.number().int().positive().optional(),
  price: z.number().positive("Price must be positive"),
  billing_cycle: z.enum(["monthly", "quarterly"]).optional(),
  includes_fertilizer: z.boolean().optional(),
  includes_pest_control: z.boolean().optional(),
});

// POST /api/ops/plans — admin only
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("service_plans")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      visit_frequency: parsed.data.visit_frequency,
      visit_duration_minutes: parsed.data.visit_duration_minutes ?? 60,
      price: parsed.data.price,
      billing_cycle: parsed.data.billing_cycle ?? "monthly",
      includes_fertilizer: parsed.data.includes_fertilizer ?? true,
      includes_pest_control: parsed.data.includes_pest_control ?? true,
      is_active: true,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId, actorRole: auth.role, action: "plan.created",
    targetTable: "service_plans", targetId: data.id,
    metadata: { name: parsed.data.name, price: parsed.data.price },
    ip,
    userAgent,
  });

  return NextResponse.json({ data }, { status: 201 });
}
