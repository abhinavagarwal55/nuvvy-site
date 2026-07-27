import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const PLAN_SELECT =
  "id, name, description, visit_frequency, visit_duration_minutes, price, billing_cycle, includes_fertilizer, includes_pest_control, plan_type, pricing_model, hourly_rate, is_active, created_at";

// GET /api/ops/plans?active=true&type=ondemand
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
  const type = searchParams.get("type");

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("service_plans")
    .select(PLAN_SELECT)
    .order("created_at", { ascending: false });

  if (activeOnly === "true") query = query.eq("is_active", true);
  if (type === "ondemand" || type === "subscription") query = query.eq("plan_type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

// Subscription + on-demand plan creation share one endpoint, discriminated by
// plan_type. On-demand plans are per_hour; subscription plans are per_plant_count.
const CreatePlanSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    plan_type: z.enum(["subscription", "ondemand"]).default("subscription"),
    // subscription
    visit_frequency: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
    visit_duration_minutes: z.number().int().positive().optional(),
    price: z.number().positive().optional(),
    billing_cycle: z.enum(["monthly", "quarterly"]).optional(),
    includes_fertilizer: z.boolean().optional(),
    includes_pest_control: z.boolean().optional(),
    // ondemand
    hourly_rate: z.number().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.plan_type === "ondemand") {
      if (v.hourly_rate === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "hourly_rate is required for on-demand plans", path: ["hourly_rate"] });
      }
    } else {
      if (!v.visit_frequency) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "visit_frequency is required", path: ["visit_frequency"] });
      }
      if (v.price === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "price is required", path: ["price"] });
      }
    }
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
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = getSupabaseAdmin();

  const insert =
    d.plan_type === "ondemand"
      ? {
          name: d.name,
          description: d.description ?? null,
          plan_type: "ondemand",
          pricing_model: "per_hour",
          hourly_rate: d.hourly_rate,
          // price is NOT NULL on service_plans; mirror the hourly rate.
          price: d.hourly_rate,
          visit_frequency: null,
          is_active: true,
          created_by: auth.userId,
        }
      : {
          name: d.name,
          description: d.description ?? null,
          plan_type: "subscription",
          pricing_model: "per_plant_count",
          visit_frequency: d.visit_frequency,
          visit_duration_minutes: d.visit_duration_minutes ?? 60,
          price: d.price,
          billing_cycle: d.billing_cycle ?? "monthly",
          includes_fertilizer: d.includes_fertilizer ?? true,
          includes_pest_control: d.includes_pest_control ?? true,
          is_active: true,
          created_by: auth.userId,
        };

  const { data, error } = await supabase
    .from("service_plans")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plan.created",
    targetTable: "service_plans",
    targetId: data.id,
    metadata: { name: d.name, plan_type: d.plan_type, hourly_rate: d.hourly_rate ?? null, price: d.price ?? d.hourly_rate ?? null },
    ip,
    userAgent,
  });

  return NextResponse.json({ data }, { status: 201 });
}
