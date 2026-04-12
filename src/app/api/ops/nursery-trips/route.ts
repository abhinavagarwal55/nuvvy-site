import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/auth/ops-auth";
import { logAuditEvent } from "@/lib/services/audit";

// ---------------------------------------------------------------------------
// GET /api/ops/nursery-trips — list trips with optional filters
// ---------------------------------------------------------------------------
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
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("nursery_trips")
    .select("*")
    .order("trip_date", { ascending: false });

  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("trip_date", dateFrom);
  if (dateTo) query = query.lte("trip_date", dateTo);

  const { data: trips, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get linked item counts per trip
  const tripIds = (trips ?? []).map((t) => t.id);
  let itemCounts: Record<string, number> = {};

  if (tripIds.length > 0) {
    const { data: items } = await supabase
      .from("plant_order_items")
      .select("nursery_trip_id")
      .in("nursery_trip_id", tripIds);

    if (items) {
      itemCounts = items.reduce(
        (acc, item) => {
          const tid = item.nursery_trip_id as string;
          acc[tid] = (acc[tid] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }
  }

  const result = (trips ?? []).map((trip) => ({
    ...trip,
    item_count: itemCounts[trip.id] || 0,
  }));

  return NextResponse.json({ data: result });
}

// ---------------------------------------------------------------------------
// POST /api/ops/nursery-trips — create a nursery trip
// ---------------------------------------------------------------------------
const CreateTripSchema = z.object({
  trip_date: z.string().min(1, "trip_date is required"),
  nursery_name: z.string().optional(),
  notes: z.string().optional(),
});

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  const { data, error } = await supabase
    .from("nursery_trips")
    .insert({
      trip_date: d.trip_date,
      nursery_name: d.nursery_name ?? null,
      notes: d.notes ?? null,
      trip_owner_id: auth.userId,
      status: "planned",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    actorId: auth.userId,
    actorRole: auth.role,
    action: "nursery_trip.created",
    targetTable: "nursery_trips",
    targetId: data.id,
    metadata: { trip_date: d.trip_date, nursery_name: d.nursery_name },
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data }, { status: 201 });
}
