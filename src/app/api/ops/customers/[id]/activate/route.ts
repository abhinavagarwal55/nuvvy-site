import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { generateServices } from "@/lib/services/scheduling";
import { logAuditEvent } from "@/lib/services/audit";
import { sendNotificationEmail } from "@/lib/email/send-email";
import { customerActivatedEmail } from "@/lib/email/templates";

const ActivateSchema = z.object({
  plan_id: z.string().uuid("Plan is required"),
  slot: z.object({
    day_of_week: z.number().int().min(0).max(6),
    time_window_start: z.string(), // HH:MM
    time_window_end: z.string(),
    gardener_id: z.string().uuid(),
  }).optional(),
  care_anchors: z.array(
    z.object({
      care_action_type_id: z.string().uuid(),
      cycle_anchor_date: z.string(), // YYYY-MM-DD
    })
  ).optional().default([]),
});

// POST /api/ops/customers/[id]/activate
// Activation gate: plan + slot + care anchors all required
// Transitions DRAFT → ACTIVE, creates subscription, slot, care schedules, and generates services
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
  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { plan_id, slot, care_anchors } = parsed.data;

  // Verify customer exists and is in DRAFT status
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", id)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (customer.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Cannot activate: customer status is ${customer.status}` },
      { status: 400 }
    );
  }

  // Verify plan exists and is active
  const { data: plan } = await supabase
    .from("service_plans")
    .select("id, visit_frequency")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json(
      { error: "Plan not found or inactive" },
      { status: 400 }
    );
  }

  // Verify gardener exists (only if slot provided)
  if (slot) {
    const { data: gardener } = await supabase
      .from("gardeners")
      .select("id")
      .eq("id", slot.gardener_id)
      .single();

    if (!gardener) {
      return NextResponse.json(
        { error: "Gardener not found" },
        { status: 400 }
      );
    }
  }

  // 1. Create subscription
  const today = new Date().toISOString().split("T")[0];
  const { data: subscription, error: subErr } = await supabase
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

  // 2. Create service slot + generate services (only if slot provided)
  let newSlotId: string | null = null;
  let generatedCount = 0;

  if (slot) {
    const { data: newSlot, error: slotErr } = await supabase
      .from("service_slots")
      .insert({
        customer_id: id,
        gardener_id: slot.gardener_id,
        day_of_week: slot.day_of_week,
        time_window_start: slot.time_window_start,
        time_window_end: slot.time_window_end,
        is_active: true,
        effective_from: today,
      })
      .select("id")
      .single();

    if (slotErr) {
      return NextResponse.json({ error: slotErr.message }, { status: 500 });
    }

    newSlotId = newSlot.id;

    // Generate services for next 6 weeks
    generatedCount = await generateServices(supabase, {
      slotId: newSlot.id,
      customerId: id,
      gardenerId: slot.gardener_id,
      subscriptionId: subscription.id,
      dayOfWeek: slot.day_of_week,
      timeStart: slot.time_window_start,
      timeEnd: slot.time_window_end,
      visitFrequency: plan.visit_frequency,
      fromDate: today,
      weeksAhead: 6,
    });
  }

  // 3. Create care schedules
  if (care_anchors.length > 0) {
    const careRows = care_anchors.map((ca) => ({
      customer_id: id,
      care_action_type_id: ca.care_action_type_id,
      cycle_anchor_date: ca.cycle_anchor_date,
      next_due_date: ca.cycle_anchor_date,
    }));

    const { error: careErr } = await supabase
      .from("customer_care_schedules")
      .insert(careRows);

    if (careErr) {
      return NextResponse.json({ error: careErr.message }, { status: 500 });
    }
  }

  // 4. Activate customer
  const { error: activateErr } = await supabase
    .from("customers")
    .update({ status: "ACTIVE" })
    .eq("id", id);

  if (activateErr) {
    return NextResponse.json({ error: activateErr.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent") || null;

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "customer.activated",
    targetTable: "customers",
    targetId: id,
    metadata: { plan_id, slot: slot ?? null },
    ip,
    userAgent,
  });

  // Send email notification (fire-and-forget)
  (async () => {
    try {
      const { data: cust } = await supabase
        .from("customers")
        .select("name, phone_number, email, address, society_id, plant_count_range, light_condition")
        .eq("id", id)
        .single();
      const { data: planInfo } = await supabase
        .from("service_plans")
        .select("name, price")
        .eq("id", plan_id)
        .single();
      let societyName = null;
      if (cust?.society_id) {
        const { data: soc } = await supabase.from("societies").select("name").eq("id", cust.society_id).single();
        societyName = soc?.name ?? null;
      }
      let gardenerName = null;
      let slotDay = null;
      if (slot) {
        const { data: g } = await supabase.from("profiles").select("full_name").eq("id", slot.gardener_id).maybeSingle();
        if (!g) {
          const { data: gard } = await supabase.from("gardeners").select("id, profile_id").eq("id", slot.gardener_id).single();
          if (gard?.profile_id) {
            const { data: gp } = await supabase.from("profiles").select("full_name").eq("id", gard.profile_id).single();
            gardenerName = gp?.full_name ?? null;
          }
        } else {
          gardenerName = g.full_name;
        }
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        slotDay = days[slot.day_of_week] ?? null;
      }
      const { data: actor } = await supabase.from("profiles").select("full_name").eq("id", auth.userId).single();

      const email = customerActivatedEmail({
        name: cust?.name ?? "Unknown",
        phone: cust?.phone_number ?? "",
        email: cust?.email,
        address: cust?.address,
        society: societyName,
        plantCountRange: cust?.plant_count_range,
        lightCondition: cust?.light_condition,
        planName: planInfo?.name,
        planPrice: planInfo?.price,
        gardenerName,
        slotDay,
        slotTime: slot ? `${slot.time_window_start}–${slot.time_window_end}` : null,
        activatedBy: actor?.full_name ?? auth.role,
      });
      await sendNotificationEmail(email.subject, email.html);
    } catch (err) {
      console.error("Customer activation email failed:", err);
    }
  })();

  return NextResponse.json({
    data: {
      customer_id: id,
      subscription_id: subscription.id,
      slot_id: newSlotId,
      services_generated: generatedCount,
      needs_slot: !slot,
      needs_care_schedules: care_anchors.length === 0,
    },
  });
}
