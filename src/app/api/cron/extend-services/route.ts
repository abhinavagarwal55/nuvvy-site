import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateServices } from "@/lib/services/scheduling";

// GET /api/cron/extend-services
// Called daily by Vercel Cron. Walks every active service_slot and tops up
// services to a 6-week horizon from today. Idempotent — generateServices()
// skips dates that already have a service for the slot, so re-runs are safe.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Manual
// invocations from a browser/curl without the header are rejected.
export async function GET(request: NextRequest) {
  // Allow calls only from Vercel Cron (header set by Vercel) or with secret
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  const { data: slots, error: slotsErr } = await supabase
    .from("service_slots")
    .select("id, customer_id, gardener_id, day_of_week, time_window_start, time_window_end")
    .eq("is_active", true);

  if (slotsErr) {
    return NextResponse.json({ error: slotsErr.message }, { status: 500 });
  }

  let totalGenerated = 0;
  let processed = 0;
  let skipped = 0;
  const errors: { slot_id: string; reason: string }[] = [];

  for (const slot of slots ?? []) {
    if (!slot.gardener_id) {
      skipped++;
      errors.push({ slot_id: slot.id, reason: "no gardener assigned" });
      continue;
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, plan_id")
      .eq("customer_id", slot.customer_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.plan_id) {
      skipped++;
      errors.push({ slot_id: slot.id, reason: "no active subscription" });
      continue;
    }

    const { data: plan } = await supabase
      .from("service_plans")
      .select("visit_frequency")
      .eq("id", sub.plan_id)
      .single();

    if (!plan) {
      skipped++;
      errors.push({ slot_id: slot.id, reason: "plan not found" });
      continue;
    }

    try {
      const generated = await generateServices(supabase, {
        slotId: slot.id,
        customerId: slot.customer_id,
        gardenerId: slot.gardener_id,
        subscriptionId: sub.id,
        dayOfWeek: slot.day_of_week,
        timeStart: slot.time_window_start,
        timeEnd: slot.time_window_end,
        visitFrequency: plan.visit_frequency,
        fromDate: today,
        weeksAhead: 6,
      });
      totalGenerated += generated;
      processed++;
    } catch (e) {
      skipped++;
      errors.push({ slot_id: slot.id, reason: (e as Error).message });
    }
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    slots_total: (slots ?? []).length,
    slots_processed: processed,
    slots_skipped: skipped,
    services_generated: totalGenerated,
    errors,
  });
}
