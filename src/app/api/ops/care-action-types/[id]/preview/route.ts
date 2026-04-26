import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { computeNextDueDate, todayUtcStr } from "@/lib/services/care-schedule";

// GET /api/ops/care-action-types/[id]/preview?frequency=N
// Returns the customer impact of changing this care action's frequency,
// without writing any changes.
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
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const newFreq = parseInt(searchParams.get("frequency") ?? "");
  if (isNaN(newFreq) || newFreq < 1 || newFreq > 365) {
    return NextResponse.json({ error: "frequency must be 1-365" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("care_action_types")
    .select("id, name, default_frequency_days")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Care action type not found" }, { status: 404 });
  }

  const { data: schedules } = await supabase
    .from("customer_care_schedules")
    .select("id, customer_id, cycle_anchor_date, last_done_date, next_due_date")
    .eq("care_action_type_id", id);

  const customerIds = [...new Set((schedules ?? []).map((s) => s.customer_id))];
  let customerNames: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    customerNames = Object.fromEntries((customers ?? []).map((c) => [c.id, c.name]));
  }

  const today = todayUtcStr();

  const affected = (schedules ?? []).map((s) => {
    const newNextDue = computeNextDueDate(
      s.cycle_anchor_date,
      s.last_done_date,
      newFreq,
      today
    );
    return {
      schedule_id: s.id,
      customer_id: s.customer_id,
      customer_name: customerNames[s.customer_id] ?? "Unknown",
      current_next_due: s.next_due_date,
      new_next_due: newNextDue,
      changed: s.next_due_date !== newNextDue,
    };
  });

  affected.sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.new_next_due.localeCompare(b.new_next_due);
  });

  return NextResponse.json({
    data: {
      action_name: existing.name,
      current_frequency_days: existing.default_frequency_days,
      new_frequency_days: newFreq,
      total_customers: affected.length,
      changed_count: affected.filter((a) => a.changed).length,
      affected,
    },
  });
}
