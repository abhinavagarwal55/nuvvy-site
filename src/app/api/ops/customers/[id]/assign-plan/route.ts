import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";
import { generateServices } from "@/lib/services/scheduling";

const Schema = z.object({
  plan_id: z.string().uuid("Plan ID is required"),
});

// POST /api/ops/customers/[id]/assign-plan
// Assigns a new plan. If frequency changes, deletes future scheduled services
// and regenerates from the active slot.
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
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];
  const { plan_id } = parsed.data;

  // Verify customer is active
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!customer || customer.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Customer must be active" },
      { status: 400 }
    );
  }

  // Get new plan
  const { data: newPlan } = await supabase
    .from("service_plans")
    .select("id, visit_frequency")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!newPlan) {
    return NextResponse.json(
      { error: "Plan not found or inactive" },
      { status: 400 }
    );
  }

  // Get current subscription + old plan frequency
  const { data: currentSub } = await supabase
    .from("subscriptions")
    .select("id, plan_id")
    .eq("customer_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let oldFrequency: string | null = null;
  if (currentSub?.plan_id) {
    const { data: oldPlan } = await supabase
      .from("service_plans")
      .select("visit_frequency")
      .eq("id", currentSub.plan_id)
      .single();
    oldFrequency = oldPlan?.visit_frequency ?? null;
  }

  // 1. Pause old subscription if exists
  if (currentSub) {
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", currentSub.id);
  }

  // 2. Create new subscription
  const { data: newSub, error: subErr } = await supabase
    .from("subscriptions")
    .insert({
      customer_id: id,
      plan_id,
      start_date: today,
      status: "active",
    })
    .select("id")
    .single();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  // 3. If frequency changed, delete future scheduled services and regenerate
  let regeneratedCount = 0;
  if (oldFrequency && oldFrequency !== newPlan.visit_frequency) {
    // Delete future scheduled services (preserve one-offs and non-scheduled)
    await supabase
      .from("service_visits")
      .delete()
      .eq("customer_id", id)
      .gt("scheduled_date", today)
      .eq("status", "scheduled")
      .not("slot_id", "is", null); // preserve one-off services (slot_id IS NULL)

    // Get active slot to regenerate
    const { data: activeSlot } = await supabase
      .from("service_slots")
      .select("id, gardener_id, day_of_week, time_window_start, time_window_end")
      .eq("customer_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSlot) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

      regeneratedCount = await generateServices(supabase, {
        slotId: activeSlot.id,
        customerId: id,
        gardenerId: activeSlot.gardener_id,
        subscriptionId: newSub.id,
        dayOfWeek: activeSlot.day_of_week,
        timeStart: activeSlot.time_window_start,
        timeEnd: activeSlot.time_window_end,
        visitFrequency: newPlan.visit_frequency,
        fromDate: tomorrowStr,
        weeksAhead: 6,
      });
    }
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "plan.assigned",
    targetTable: "subscriptions",
    targetId: newSub.id,
    metadata: {
      customer_id: id,
      new_plan_id: plan_id,
      old_plan_id: currentSub?.plan_id ?? null,
      frequency_changed: oldFrequency !== newPlan.visit_frequency,
      services_regenerated: regeneratedCount,
    },
  });

  return NextResponse.json({
    data: {
      subscription_id: newSub.id,
      frequency_changed: oldFrequency !== null && oldFrequency !== newPlan.visit_frequency,
      services_regenerated: regeneratedCount,
    },
  });
}
