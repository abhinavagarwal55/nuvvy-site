import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// GET /api/ops/ondemand/bills/:id — bill detail.
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

  const { data: b, error } = await supabase
    .from("bills")
    .select(
      "id, bill_type, service_visit_id, customer_id, amount_inr, hourly_rate, actual_hours_spent, status, generated_at, paid_at, notes, created_at, customers(id, name, unit_number, societies(name))"
    )
    .eq("id", id)
    .eq("bill_type", "ondemand")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!b) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const cust = b.customers as unknown as { id: string; name: string; unit_number: string | null; societies: { name: string } | null } | null;

  let service: Record<string, unknown> | null = null;
  if (b.service_visit_id) {
    const { data: sv } = await supabase
      .from("service_visits")
      .select("id, scheduled_date, status, estimated_hours, actual_hours_spent, special_tasks")
      .eq("id", b.service_visit_id)
      .maybeSingle();
    service = sv ?? null;
  }

  return NextResponse.json({
    data: {
      id: b.id,
      service_visit_id: b.service_visit_id,
      customer: cust
        ? { id: cust.id, name: cust.name, society: cust.societies?.name ?? null, apartment_number: cust.unit_number }
        : null,
      amount: b.amount_inr,
      hourly_rate: b.hourly_rate,
      actual_hours_spent: b.actual_hours_spent,
      status: b.status,
      generated_at: b.generated_at,
      paid_at: b.paid_at,
      notes: b.notes,
      service_date: (service?.scheduled_date as string) ?? null,
      service,
      created_at: b.created_at,
    },
  });
}

const PatchBillSchema = z.object({
  status: z.enum(["draft", "pending_payment", "paid"]).optional(),
  paid_at: z.string().optional(),
  notes: z.string().nullish(),
});

// PATCH /api/ops/ondemand/bills/:id — update status / notes (mark paid, etc.).
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
  if (auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = PatchBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: bill } = await supabase
    .from("bills")
    .select("id, status, bill_type")
    .eq("id", id)
    .eq("bill_type", "ondemand")
    .maybeSingle();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // A paid bill is immutable — no status changes (payment reversal is out of
  // scope V1). Notes stay editable.
  if (bill.status === "paid" && d.status && d.status !== "paid") {
    return NextResponse.json({ error: "A paid bill cannot change status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.notes !== undefined) update.notes = d.notes ?? null;
  if (d.status) {
    update.status = d.status;
    if (d.status === "paid") {
      update.paid_at = d.paid_at ?? new Date().toISOString();
      update.paid_by = auth.userId;
    }
  }

  const { data: updated, error } = await supabase
    .from("bills")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;
  if (d.status && d.status !== bill.status) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: "bill.status_changed",
      targetTable: "bills",
      targetId: id,
      metadata: { from: bill.status, to: d.status },
      ip,
      userAgent,
    });
  }

  return NextResponse.json({ data: updated });
}
