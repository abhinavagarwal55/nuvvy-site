import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { generateServices } from "@/lib/services/scheduling";
import { logAuditEvent } from "@/lib/services/audit";

const CreateSlotSchema = z.object({
  customer_id: z.string().uuid(),
  gardener_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  time_window_start: z.string(), // HH:MM
  time_window_end: z.string(),
});

const UpdateSlotSchema = z.object({
  slot_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  time_window_start: z.string(),
  time_window_end: z.string(),
  gardener_id: z.string().uuid(),
});

// GET /api/ops/schedule/slots?customer_id=xxx
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
  const customerId = searchParams.get("customer_id");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("service_slots")
    .select("id, customer_id, gardener_id, day_of_week, time_window_start, time_window_end, is_active, effective_from, effective_until, created_at")
    .order("created_at", { ascending: false });

  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

// POST /api/ops/schedule/slots — create slot → triggers service generation
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
  const parsed = CreateSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;
  const today = new Date().toISOString().split("T")[0];

  // Verify customer is ACTIVE
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", d.customer_id)
    .single();

  if (!customer || customer.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Customer must be active to create a slot" },
      { status: 400 }
    );
  }

  // Get active subscription for visit frequency
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan_id")
    .eq("customer_id", d.customer_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "Customer has no active subscription" },
      { status: 400 }
    );
  }

  const { data: plan } = await supabase
    .from("service_plans")
    .select("visit_frequency")
    .eq("id", subscription.plan_id)
    .single();

  if (!plan) {
    return NextResponse.json(
      { error: "Plan not found" },
      { status: 500 }
    );
  }

  // Create the slot
  const { data: slot, error: slotErr } = await supabase
    .from("service_slots")
    .insert({
      customer_id: d.customer_id,
      gardener_id: d.gardener_id,
      day_of_week: d.day_of_week,
      time_window_start: d.time_window_start,
      time_window_end: d.time_window_end,
      is_active: true,
      effective_from: today,
    })
    .select()
    .single();

  if (slotErr) {
    return NextResponse.json({ error: slotErr.message }, { status: 500 });
  }

  // Generate services
  const generatedCount = await generateServices(supabase, {
    slotId: slot.id,
    customerId: d.customer_id,
    gardenerId: d.gardener_id,
    subscriptionId: subscription.id,
    dayOfWeek: d.day_of_week,
    timeStart: d.time_window_start,
    timeEnd: d.time_window_end,
    visitFrequency: plan.visit_frequency,
    effectiveFrom: today,
    fromDate: today,
    weeksAhead: 6,
  });

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.slot_created",
    targetTable: "service_slots",
    targetId: slot.id,
    ip,
    userAgent,
  });

  return NextResponse.json(
    { data: { ...slot, services_generated: generatedCount } },
    { status: 201 }
  );
}

// PUT /api/ops/schedule/slots — permanent reschedule (all future)
// Deactivates old slot, deletes future scheduled services, creates new slot, generates new services
export async function PUT(request: NextRequest) {
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
  const parsed = UpdateSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;
  const today = new Date().toISOString().split("T")[0];

  // Get old slot
  const { data: oldSlot } = await supabase
    .from("service_slots")
    .select("id, customer_id, is_active")
    .eq("id", d.slot_id)
    .single();

  if (!oldSlot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Get subscription + plan frequency
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan_id")
    .eq("customer_id", oldSlot.customer_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!subscription) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const { data: plan } = await supabase
    .from("service_plans")
    .select("visit_frequency")
    .eq("id", subscription.plan_id)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 500 });
  }

  // 1. Capture IDs of future scheduled services on the old slot — these
  //    need to be removed once the new slot is in place.
  const { data: toDeleteRows, error: toDeleteErr } = await supabase
    .from("service_visits")
    .select("id")
    .eq("slot_id", d.slot_id)
    .eq("status", "scheduled")
    .gt("scheduled_date", today);
  if (toDeleteErr) {
    return NextResponse.json({ error: toDeleteErr.message }, { status: 500 });
  }
  const toDeleteIds = (toDeleteRows ?? []).map((r) => r.id);

  // 2. Deactivate old slot
  await supabase
    .from("service_slots")
    .update({ is_active: false, effective_until: today })
    .eq("id", d.slot_id);

  // 3. Create new slot
  const { data: newSlot, error: newSlotErr } = await supabase
    .from("service_slots")
    .insert({
      customer_id: oldSlot.customer_id,
      gardener_id: d.gardener_id,
      day_of_week: d.day_of_week,
      time_window_start: d.time_window_start,
      time_window_end: d.time_window_end,
      is_active: true,
      effective_from: today,
    })
    .select()
    .single();

  if (newSlotErr) {
    return NextResponse.json({ error: newSlotErr.message }, { status: 500 });
  }

  // 4. Generate services from new slot
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const generatedCount = await generateServices(supabase, {
    slotId: newSlot.id,
    customerId: oldSlot.customer_id,
    gardenerId: d.gardener_id,
    subscriptionId: subscription.id,
    dayOfWeek: d.day_of_week,
    timeStart: d.time_window_start,
    timeEnd: d.time_window_end,
    visitFrequency: plan.visit_frequency,
    effectiveFrom: today,
    fromDate: tomorrowStr,
    weeksAhead: 6,
  });

  // 5. Now safely delete the old slot's future services. The previous code
  //    just called .delete() without checking errors, which silently failed
  //    when FK refs (service_visit_gardeners, service_special_tasks)
  //    pointed at those services — leaving orphan visits on the old slot.
  if (toDeleteIds.length > 0) {
    // Reassign special tasks to the earliest new-slot service (so the
    // gardener still gets the task on the customer's next visit).
    const { data: nextNew } = await supabase
      .from("service_visits")
      .select("id")
      .eq("slot_id", newSlot.id)
      .eq("status", "scheduled")
      .order("scheduled_date")
      .limit(1)
      .maybeSingle();
    if (nextNew?.id) {
      await supabase
        .from("service_special_tasks")
        .update({ for_service_id: nextNew.id })
        .in("for_service_id", toDeleteIds);
    }
    // created_after_service_id is just provenance — null it out
    await supabase
      .from("service_special_tasks")
      .update({ created_after_service_id: null })
      .in("created_after_service_id", toDeleteIds);
    // Drop junction rows
    await supabase
      .from("service_visit_gardeners")
      .delete()
      .in("service_id", toDeleteIds);
    // Now delete the services, with error checking
    const { error: delErr } = await supabase
      .from("service_visits")
      .delete()
      .in("id", toDeleteIds);
    if (delErr) {
      return NextResponse.json(
        { error: `Failed to clean up old slot services: ${delErr.message}` },
        { status: 500 }
      );
    }
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "schedule.slot_updated",
    targetTable: "service_slots",
    targetId: newSlot.id,
    metadata: { old_slot_id: d.slot_id },
    ip,
    userAgent,
  });

  return NextResponse.json({
    data: { ...newSlot, services_generated: generatedCount },
  });
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
