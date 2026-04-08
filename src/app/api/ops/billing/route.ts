import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

const CreateBillSchema = z.object({
  customer_id: z.string().uuid(),
  plan_id: z.string().uuid().optional(),
  amount_inr: z.number().int().positive(),
  billing_period_start: z.string(),
  billing_period_end: z.string(),
  due_date: z.string(),
  notes: z.string().optional(),
});

// GET /api/ops/billing?status=pending&customer_id=xxx
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
  const status = searchParams.get("status");
  const customerId = searchParams.get("customer_id");

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("bills")
    .select("*")
    .order("due_date", { ascending: false });

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join customer names
  const customerIds = [...new Set((data ?? []).map((b) => b.customer_id))];
  let nameMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    nameMap = Object.fromEntries(
      (customers ?? []).map((c) => [c.id, c.name])
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const bills = (data ?? []).map((b) => ({
    ...b,
    customer_name: nameMap[b.customer_id] ?? "Unknown",
    is_overdue: b.status === "pending" && b.due_date < today,
  }));

  return NextResponse.json({ data: bills });
}

// POST /api/ops/billing — admin only
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
  const parsed = CreateBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bills")
    .insert({
      ...parsed.data,
      status: "pending",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "bill.created",
    targetTable: "bills",
    targetId: data.id,
    metadata: { customer_id: parsed.data.customer_id, amount_inr: parsed.data.amount_inr },
    ip,
    userAgent,
  });

  return NextResponse.json({ data }, { status: 201 });
}
