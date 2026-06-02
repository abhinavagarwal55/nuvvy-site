import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { monthBounds } from "@/lib/billing/template";

const PutSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
    amount_inr: z.number().int().nonnegative().optional(),
    paid: z.boolean().optional(),
    mark_reminder_sent: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.amount_inr !== undefined ||
      v.paid !== undefined ||
      v.mark_reminder_sent !== undefined,
    { message: "At least one of amount_inr, paid, mark_reminder_sent required" }
  );

type SubscriptionRow = {
  id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  override_price: number | null;
  customers: {
    id: string;
    name: string;
    phone_number: string | null;
  } | null;
  service_plans: {
    id: string;
    name: string;
    price: number;
    visit_frequency: "weekly" | "fortnightly" | "monthly";
  } | null;
};

type BillRow = {
  id: string;
  customer_id: string;
  amount_inr: number;
  status: "pending" | "paid";
  paid_at: string | null;
  last_reminder_sent_at: string | null;
};

function ipFrom(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ subscription_id: string }> }
) {
  let auth;
  try {
    auth = await requireOpsAuth(request);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { month, amount_inr, paid, mark_reminder_sent } = parsed.data;

  const writesAdminOnly =
    amount_inr !== undefined || paid !== undefined;
  const writesAny =
    writesAdminOnly || mark_reminder_sent !== undefined;

  if (writesAdminOnly && auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  if (writesAny && auth.role === "gardener") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subscription_id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: subRaw, error: subErr } = await supabase
    .from("subscriptions")
    .select(
      `
        id,
        customer_id,
        plan_id,
        status,
        override_price,
        customers!inner ( id, name, phone_number ),
        service_plans!inner ( id, name, price, visit_frequency )
      `
    )
    .eq("id", subscription_id)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }
  if (!subRaw) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  const sub = subRaw as unknown as SubscriptionRow;
  if (sub.status !== "active") {
    return NextResponse.json({ error: "Subscription not active" }, { status: 404 });
  }
  if (!sub.customers || !sub.service_plans) {
    return NextResponse.json({ error: "Subscription incomplete" }, { status: 500 });
  }

  let bounds: { start: string; end: string };
  try {
    bounds = monthBounds(month);
  } catch {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const defaultAmount = Math.round(
    Number(sub.override_price ?? sub.service_plans.price)
  );

  const { data: existing, error: billErr } = await supabase
    .from("bills")
    .select("id, customer_id, amount_inr, status, paid_at, last_reminder_sent_at")
    .eq("customer_id", sub.customer_id)
    .eq("billing_period_start", bounds.start)
    .limit(1)
    .maybeSingle();

  if (billErr) {
    return NextResponse.json({ error: billErr.message }, { status: 500 });
  }

  const ip = ipFrom(request);
  const userAgent = request.headers.get("user-agent") || null;
  const nowIso = new Date().toISOString();

  let bill: BillRow;
  let createdNew = false;
  const auditEvents: Array<{
    action: string;
    metadata?: Record<string, unknown>;
  }> = [];

  if (!existing) {
    const insertAmount = amount_inr ?? defaultAmount;
    const insertStatus = paid === true ? "paid" : "pending";
    const insertPaidAt = paid === true ? nowIso : null;
    const insertPaidBy = paid === true ? auth.userId : null;
    const insertReminderAt = mark_reminder_sent === true ? nowIso : null;

    const { data: created, error: insErr } = await supabase
      .from("bills")
      .insert({
        customer_id: sub.customer_id,
        plan_id: sub.plan_id,
        amount_inr: insertAmount,
        billing_period_start: bounds.start,
        billing_period_end: bounds.end,
        due_date: bounds.end,
        status: insertStatus,
        paid_at: insertPaidAt,
        paid_by: insertPaidBy,
        last_reminder_sent_at: insertReminderAt,
        created_by: auth.userId,
      })
      .select("id, customer_id, amount_inr, status, paid_at, last_reminder_sent_at")
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { error: insErr?.message ?? "Failed to create bill" },
        { status: 500 }
      );
    }
    bill = created as BillRow;
    createdNew = true;
    auditEvents.push({
      action: "bill.created",
      metadata: {
        customer_id: sub.customer_id,
        subscription_id,
        month,
        amount_inr: insertAmount,
      },
    });
    if (amount_inr !== undefined && amount_inr !== defaultAmount) {
      auditEvents.push({
        action: "bill.amount_updated",
        metadata: { old: defaultAmount, new: amount_inr },
      });
    }
    if (paid === true) {
      auditEvents.push({ action: "bill.marked_paid" });
    }
    if (mark_reminder_sent === true) {
      auditEvents.push({ action: "bill.reminder_sent" });
    }
  } else {
    const updates: Record<string, unknown> = {};

    if (amount_inr !== undefined && amount_inr !== existing.amount_inr) {
      updates.amount_inr = amount_inr;
      auditEvents.push({
        action: "bill.amount_updated",
        metadata: { old: existing.amount_inr, new: amount_inr },
      });
    }

    if (paid === true && existing.status !== "paid") {
      updates.status = "paid";
      updates.paid_at = nowIso;
      updates.paid_by = auth.userId;
      auditEvents.push({ action: "bill.marked_paid" });
    } else if (paid === false && existing.status === "paid") {
      updates.status = "pending";
      updates.paid_at = null;
      updates.paid_by = null;
      auditEvents.push({ action: "bill.unmarked_paid" });
    }

    if (mark_reminder_sent === true) {
      updates.last_reminder_sent_at = nowIso;
      auditEvents.push({ action: "bill.reminder_sent" });
    }

    if (Object.keys(updates).length === 0) {
      bill = existing as BillRow;
    } else {
      const { data: updated, error: updErr } = await supabase
        .from("bills")
        .update(updates)
        .eq("id", existing.id)
        .select("id, customer_id, amount_inr, status, paid_at, last_reminder_sent_at")
        .single();
      if (updErr || !updated) {
        return NextResponse.json(
          { error: updErr?.message ?? "Failed to update bill" },
          { status: 500 }
        );
      }
      bill = updated as BillRow;
    }
  }

  for (const evt of auditEvents) {
    logAuditEvent({
      actorId: auth.userId,
      actorRole: auth.role,
      action: evt.action,
      targetTable: "bills",
      targetId: bill.id,
      metadata: evt.metadata,
      ip,
      userAgent,
    });
  }

  const row = {
    subscription_id,
    customer_id: sub.customer_id,
    customer_name: sub.customers.name,
    phone_number: sub.customers.phone_number,
    plan_name: sub.service_plans.name,
    plan_price: Math.round(Number(sub.service_plans.price)),
    visit_frequency: sub.service_plans.visit_frequency,
    default_amount_inr: defaultAmount,
    bill_id: bill.id,
    amount_inr: bill.amount_inr,
    is_paid: bill.status === "paid",
    paid_at: bill.paid_at,
    last_reminder_sent_at: bill.last_reminder_sent_at,
  };

  return NextResponse.json({ data: row }, { status: createdNew ? 201 : 200 });
}
